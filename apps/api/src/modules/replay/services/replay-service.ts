import { EventType, NotificationStatus } from '@prisma/client';
import { logger } from '../../../infrastructure/logger';
import { HttpError } from '../../../shared/errors/http-error';
import { NotificationEventRepository } from '../../notifications/interfaces/notification-event-repository';
import { NotificationRepository } from '../../notifications/interfaces/notification-repository';
import { QueueService } from '../../notifications/interfaces/queue-service';
import { ReplayNotificationDto } from '../dto/replay-notification.dto';
import { ReplayNotificationResponse } from '../dto/replay-response';
import { ReplayExecutionRepository } from '../interfaces/replay-execution-repository';
import { assertReplayable } from '../validators/replay-validator';

/**
 * Application/business logic for notification replay.
 * Coordinates notification, event, queue, and replay-execution repositories;
 * performs no HTTP or database access itself.
 */
export class ReplayService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly eventRepository: NotificationEventRepository,
    private readonly queue: QueueService,
    private readonly replayExecutionRepository: ReplayExecutionRepository,
  ) {}

  /**
   * Replays a previously processed notification.
   *
   * Creates a new Notification record (copying the original's data), links it
   * to the original via a ReplayExecution record, emits replay lifecycle
   * events on the NEW notification, and enqueues it through the existing
   * BullMQ pipeline. The original notification and its timeline are never
   * modified.
   */
  async replayNotification(dto: ReplayNotificationDto): Promise<ReplayNotificationResponse> {
    // 1. Load original notification.
    const original = await this.notificationRepository.findNotificationById(dto.notificationId);
    if (!original) {
      throw new HttpError('Notification not found', 404, 'NOT_FOUND', [
        { field: 'notificationId', message: 'no notification exists with the given id' },
      ]);
    }

    // 2. Validate replay eligibility.
    assertReplayable(original.status);

    // 3. Create a NEW Notification, copying the original's data.
    const newNotification = await this.notificationRepository.createNotification({
      userId: original.userId,
      templateId: original.templateId,
      channel: original.channel,
      category: original.category,
      priority: original.priority,
      variables: original.payload as Record<string, unknown>,
      metadata: {
        ...(original.metadata as Record<string, unknown>),
        replayedFrom: original.id,
      },
    });

    logger.info(
      {
        originalNotificationId: original.id,
        newNotificationId: newNotification.id,
        reason: dto.reason,
      },
      'New notification created for replay',
    );

    // 4. Create ReplayExecution linking original → new.
    const replayExecution = await this.replayExecutionRepository.createReplayExecution({
      originalNotificationId: original.id,
      reason: dto.reason,
      triggeredBy: 'api',
    });

    logger.info(
      {
        replayId: replayExecution.id,
        originalNotificationId: original.id,
        newNotificationId: newNotification.id,
      },
      'ReplayExecution created',
    );

    // 5. Record REPLAY_REQUESTED on the NEW notification.
    await this.eventRepository.recordEvent({
      notificationId: newNotification.id,
      eventType: EventType.REPLAY_REQUESTED,
      statusAfter: NotificationStatus.CREATED,
      metadata: {
        originalNotificationId: original.id,
        replayId: replayExecution.id,
        reason: dto.reason,
      },
    });

    // 6. Transition new notification to QUEUED.
    await this.notificationRepository.updateNotificationStatus(
      newNotification.id,
      NotificationStatus.QUEUED,
    );

    // 7. Enqueue the new notification.
    let jobId: string | undefined;
    try {
      jobId = await this.queue.addNotificationJob(newNotification.id);
    } catch (error) {
      // Enqueue failed: mark the new notification as FAILED, record event.
      // The ReplayExecution relationship is preserved.
      await this.markEnqueueFailed(newNotification.id, replayExecution.id, original.id, error);
      throw new HttpError('Queue unavailable', 503, 'QUEUE_UNAVAILABLE');
    }

    // 8. Record JOB_QUEUED on the NEW notification.
    await this.eventRepository.recordEvent({
      notificationId: newNotification.id,
      eventType: EventType.JOB_QUEUED,
      statusBefore: NotificationStatus.CREATED,
      statusAfter: NotificationStatus.QUEUED,
      executionId: jobId,
    });

    return {
      replayId: replayExecution.id,
      notificationId: newNotification.id,
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
   * Best-effort failure recording when enqueue fails. Mirrors the pattern
   * established in NotificationService.markEnqueueFailed.
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
      await this.eventRepository.recordEvent({
        notificationId,
        eventType: EventType.DELIVERY_FAILED,
        statusBefore: NotificationStatus.QUEUED,
        statusAfter: NotificationStatus.FAILED,
        metadata: {
          stage: 'enqueue',
          error: error instanceof Error ? error.message : String(error),
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
