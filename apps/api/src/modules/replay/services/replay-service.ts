import { randomUUID } from 'crypto';
import { EventType, NotificationStatus, ReplayStatus } from '@prisma/client';
import { logger } from '../../../infrastructure/logger';
import { env } from '../../../config/env';
import { HttpError } from '../../../shared/errors/http-error';
import { NotificationEventRepository } from '../../notifications/interfaces/notification-event-repository';
import { NotificationRepository } from '../../notifications/interfaces/notification-repository';
import { QueueService } from '../../notifications/interfaces/queue-service';
import { DeadLetterRepository } from '../../dlq/interfaces/dead-letter-repository';
import { PulseTraceOutboxPayload, resolveTopicForPriority } from '../../outbox';
import { sanitizeErrorMessage } from '../../../shared/utils/sanitize-error';
import { ReplayNotificationDto } from '../dto/replay-notification.dto';
import { ReplayNotificationResponse } from '../dto/replay-response';
import { ReplayExecutionRepository } from '../interfaces/replay-execution-repository';
import { assertReplayable } from '../validators/replay-validator';

/**
 * Application/business logic for notification replay.
 * Coordinates notification, event, queue, dlq, and replay-execution repositories;
 * performs no HTTP or database access itself.
 */
export class ReplayService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly eventRepository: NotificationEventRepository,
    private readonly queue: QueueService,
    private readonly replayExecutionRepository: ReplayExecutionRepository,
    private readonly deadLetterRepository?: DeadLetterRepository,
  ) {}

  /**
   * Replays a dead-lettered notification.
   *
   * Verifies DLQ record existence, ensures no active replay is in progress,
   * creates a new Notification record with clean delivery configuration,
   * links it to the original via a ReplayExecution record (REQUESTED),
   * emits REPLAY_REQUESTED on the new notification, and enqueues it through
   * either the transactional Outbox (Kafka mode) or BullMQ (BullMQ mode).
   */
  async replayNotification(dto: ReplayNotificationDto): Promise<ReplayNotificationResponse> {
    // 1. Load original notification.
    const original = await this.notificationRepository.findNotificationById(dto.notificationId);
    if (!original) {
      throw new HttpError('Notification not found', 404, 'NOT_FOUND', [
        { field: 'notificationId', message: 'no notification exists with the given id' },
      ]);
    }

    // 2. Validate DLQ record existence and replay eligibility.
    let hasDeadLetter = true;
    if (this.deadLetterRepository) {
      const deadLetter = await this.deadLetterRepository.findDeadLetterByNotificationId(dto.notificationId);
      hasDeadLetter = !!deadLetter;
    }
    assertReplayable(original.status, hasDeadLetter);

    // 3. Prevent duplicate active replays.
    const activeReplay = await this.replayExecutionRepository.findActiveReplayByOriginalId(dto.notificationId);
    if (activeReplay) {
      throw new HttpError(
        'An active replay is already in progress for this notification',
        409,
        'ACTIVE_REPLAY_EXISTS',
        [{ field: 'notificationId', message: 'an active replay is already REQUESTED or RUNNING' }],
      );
    }

    // 4. Clean delivery configuration and correlation preservation.
    const originalMeta = (original.metadata ?? {}) as Record<string, unknown>;
    const correlationId =
      (originalMeta.correlationId as string) ||
      (originalMeta.requestId as string) ||
      original.id;

    // Filter out mutable runtime state from original metadata
    const cleanMetadata: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(originalMeta)) {
      if (!['attempt', 'nextAttempt', 'scheduledAt', 'scheduledFor', 'delayMs', 'lastErrorCode'].includes(key)) {
        cleanMetadata[key] = val;
      }
    }

    const eventId = randomUUID();
    const topic = resolveTopicForPriority(original.priority);
    const triggeredBy = dto.operatorId || 'operator';

    const newNotificationDto = {
      userId: original.userId,
      templateId: original.templateId,
      channel: original.channel,
      category: original.category,
      priority: original.priority,
      variables: (original.payload ?? {}) as Record<string, unknown>,
      metadata: {
        ...cleanMetadata,
        replayedFrom: original.id,
        correlationId,
        ...(dto.reason ? { replayReason: dto.reason } : {}),
        ...(dto.operatorId ? { operatorId: dto.operatorId } : {}),
      },
    };

    // 5. In Kafka processing mode: execute atomic Outbox + Notification + ReplayExecution transaction
    if (env.notificationProcessingMode === 'kafka' && this.notificationRepository.createNotificationTransactional) {
      const outboxPayload: PulseTraceOutboxPayload = {
        eventId,
        eventType: EventType.NOTIFICATION_CREATED,
        notificationId: '', // Populated inside transaction
        userId: original.userId,
        templateId: original.templateId,
        channel: original.channel,
        category: original.category,
        priority: original.priority,
        payload: (original.payload ?? {}) as Record<string, unknown>,
        idempotencyKey: eventId,
        correlationId,
        timestamp: new Date().toISOString(),
        retryCount: 0,
        metadata: {
          ...cleanMetadata,
          replayedFrom: original.id,
          correlationId,
          reason: dto.reason,
          operatorId: dto.operatorId,
        },
      };

      try {
        const newNotification = await this.notificationRepository.createNotificationTransactional({
          dto: newNotificationDto,
          initialStatus: NotificationStatus.QUEUED,
          events: [
            {
              eventType: EventType.REPLAY_REQUESTED,
              statusBefore: null,
              statusAfter: NotificationStatus.QUEUED,
              metadata: {
                originalNotificationId: original.id,
                reason: dto.reason,
                triggeredBy,
                correlationId,
              },
            },
          ],
          outbox: {
            topic,
            partitionKey: original.userId,
            payload: outboxPayload as unknown as Record<string, unknown>,
          },
          replayExecution: {
            originalNotificationId: original.id,
            reason: dto.reason,
            triggeredBy,
          },
        });

        const createdReplay = await this.replayExecutionRepository.findReplayExecutionByNewNotificationId(
          newNotification.id,
        );

        logger.info(
          {
            replayId: createdReplay?.id,
            originalNotificationId: original.id,
            newNotificationId: newNotification.id,
            topic,
            correlationId,
          },
          'Replay execution and transactional outbox event created for Kafka ingestion',
        );

        return {
          replayId: createdReplay?.id ?? eventId,
          originalNotificationId: original.id,
          notificationId: newNotification.id,
          status: ReplayStatus.REQUESTED,
        };
      } catch (err: unknown) {
        if ((err as { code?: string }).code === 'P2002') {
          throw new HttpError(
            'An active replay is already in progress for this notification',
            409,
            'ACTIVE_REPLAY_EXISTS',
            [{ field: 'notificationId', message: 'an active replay is already REQUESTED or RUNNING' }],
          );
        }
        throw err;
      }
    }

    // 6. BullMQ / Fallback mode:
    let replayExecution;
    try {
      replayExecution = await this.replayExecutionRepository.createReplayExecution({
        originalNotificationId: original.id,
        reason: dto.reason,
        triggeredBy,
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new HttpError(
          'An active replay is already in progress for this notification',
          409,
          'ACTIVE_REPLAY_EXISTS',
          [{ field: 'notificationId', message: 'an active replay is already REQUESTED or RUNNING' }],
        );
      }
      throw err;
    }

    const newNotification = await this.notificationRepository.createNotification({
      ...newNotificationDto,
      metadata: {
        ...newNotificationDto.metadata,
        replayId: replayExecution.id,
      },
    });

    await this.eventRepository.recordEvent({
      notificationId: newNotification.id,
      eventType: EventType.REPLAY_REQUESTED,
      statusAfter: NotificationStatus.CREATED,
      metadata: {
        originalNotificationId: original.id,
        replayId: replayExecution.id,
        reason: dto.reason,
        correlationId,
      },
    });

    await this.notificationRepository.updateNotificationStatus(
      newNotification.id,
      NotificationStatus.QUEUED,
    );

    await this.replayExecutionRepository.updateNewNotificationId(
      replayExecution.id,
      newNotification.id,
    );

    let jobId: string | undefined;
    try {
      jobId = await this.queue.addNotificationJob(newNotification.id);
    } catch (error) {
      await this.markEnqueueFailed(newNotification.id, replayExecution.id, original.id, error);
      throw new HttpError('Queue unavailable', 503, 'QUEUE_UNAVAILABLE');
    }

    const queuedNotification = await this.notificationRepository.findNotificationById(newNotification.id);
    await this.eventRepository.recordEvent({
      notificationId: newNotification.id,
      eventType: EventType.JOB_QUEUED,
      statusBefore: queuedNotification?.status ?? NotificationStatus.QUEUED,
      statusAfter: NotificationStatus.QUEUED,
      executionId: jobId,
    });

    return {
      replayId: replayExecution.id,
      originalNotificationId: original.id,
      notificationId: newNotification.id,
      status: ReplayStatus.REQUESTED,
    };
  }

  /**
   * Returns all replay executions for a given original notification.
   */
  async getReplayHistory(originalNotificationId: string) {
    const original = await this.notificationRepository.findNotificationById(originalNotificationId);
    if (!original) {
      throw new HttpError('Notification not found', 404, 'NOT_FOUND', [
        { field: 'notificationId', message: 'no notification exists with the given id' },
      ]);
    }

    return this.replayExecutionRepository.findByOriginalNotificationId(originalNotificationId);
  }

  /**
   * Best-effort failure recording when enqueue fails in BullMQ mode.
   */
  private async markEnqueueFailed(
    notificationId: string,
    replayId: string,
    originalNotificationId: string,
    error: unknown,
  ): Promise<void> {
    try {
      await this.notificationRepository.updateNotificationStatus(
        notificationId,
        NotificationStatus.FAILED,
      );
      await this.replayExecutionRepository.updateStatus(replayId, {
        status: ReplayStatus.FAILED,
        errorMessage: sanitizeErrorMessage(error),
        completedAt: new Date(),
      });
      await this.eventRepository.recordEvent({
        notificationId,
        eventType: EventType.DELIVERY_FAILED,
        statusBefore: NotificationStatus.QUEUED,
        statusAfter: NotificationStatus.FAILED,
        metadata: {
          stage: 'enqueue',
          error: sanitizeErrorMessage(error),
          replayId,
          originalNotificationId,
        },
      });
      logger.error(
        { notificationId, replayId, originalNotificationId, error },
        'Failed to enqueue replay notification job; marked FAILED',
      );
    } catch (markError) {
      logger.error(
        { notificationId, replayId, error: markError },
        'Could not record enqueue failure for replay notification',
      );
    }
  }
}
