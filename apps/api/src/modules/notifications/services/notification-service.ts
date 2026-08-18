import { EventType, Notification, NotificationEvent, NotificationStatus } from '@prisma/client';
import { logger } from '../../../infrastructure/logger';
import { HttpError } from '../../../shared/errors/http-error';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { ListNotificationsQuery } from '../dto/list-notifications-query';
import { NotificationEventRepository } from '../interfaces/notification-event-repository';
import {
  NotificationProcessingContext,
  NotificationProcessingService,
} from '../interfaces/notification-processing-service';
import { NotificationRepository, PaginatedNotifications } from '../interfaces/notification-repository';
import { QueueService } from '../interfaces/queue-service';

/**
 * Application/business logic for notifications.
 * Coordinates repository, event and queue operations; performs no HTTP or database access itself.
 */
export class NotificationService implements NotificationProcessingService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly eventRepository: NotificationEventRepository,
    private readonly queue: QueueService,
  ) {}

  async processNotification(
    notificationId: string,
    context: NotificationProcessingContext,
  ): Promise<void> {
    const notification = await this.repository.findNotificationById(notificationId);
    if (!notification) {
      throw new Error(`Notification ${notificationId} not found while processing queued job`);
    }

    // Tracks the last status this execution successfully persisted, so a
    // failure event always records an accurate statusBefore (the state before
    // the write that failed).
    let currentStatus = notification.status;

    try {
      // A retried attempt announces itself before WORKER_STARTED so the
      // timeline reads DELIVERY_FAILED → RETRY_SCHEDULED → RETRY_STARTED →
      // WORKER_STARTED. No status change here; WORKER_STARTED records the
      // actual FAILED → PROCESSING transition.
      if (context.attemptNumber > 1) {
        await this.eventRepository.recordEvent({
          notificationId: notification.id,
          eventType: EventType.RETRY_STARTED,
          statusBefore: notification.status,
          statusAfter: notification.status,
          executionId: context.jobId,
          metadata: {
            attempt: context.attemptNumber,
            maxAttempts: context.maxAttempts,
            jobId: context.jobId,
            workerId: context.workerId,
          },
        });
      }

      await this.repository.updateNotificationStatus(notification.id, NotificationStatus.PROCESSING);
      currentStatus = NotificationStatus.PROCESSING;
      await this.eventRepository.recordEvent({
        notificationId: notification.id,
        eventType: EventType.WORKER_STARTED,
        statusBefore: notification.status,
        statusAfter: NotificationStatus.PROCESSING,
        executionId: context.jobId,
        metadata: { workerId: context.workerId },
      });
      logger.info(
        { notificationId: notification.id, jobId: context.jobId, workerId: context.workerId },
        'Worker started processing notification',
      );

      // Mock delivery; a real provider invocation lands here in a later phase.
      await this.repository.updateNotificationStatus(
        notification.id,
        NotificationStatus.DELIVERED,
      );
      currentStatus = NotificationStatus.DELIVERED;
      await this.eventRepository.recordEvent({
        notificationId: notification.id,
        eventType: EventType.WORKER_COMPLETED,
        statusBefore: NotificationStatus.PROCESSING,
        statusAfter: NotificationStatus.DELIVERED,
        executionId: context.jobId,
        metadata: { workerId: context.workerId },
      });
      logger.info(
        { notificationId: notification.id, jobId: context.jobId, workerId: context.workerId },
        'Worker processed notification',
      );
    } catch (error) {
      await this.markNotificationFailed(notification.id, currentStatus, context, error);
      // Rethrow so BullMQ still records the job as failed and applies retries.
      throw error;
    }
  }

  /**
   * Transitions a notification to FAILED and records the failure event.
   * Best effort: if even the failure bookkeeping fails (e.g. database down),
   * the original error is logged and still propagates to BullMQ.
   */
  private async markNotificationFailed(
    notificationId: string,
    statusBefore: NotificationStatus,
    context: NotificationProcessingContext,
    error: unknown,
  ): Promise<void> {
    try {
      await this.repository.updateNotificationStatus(notificationId, NotificationStatus.FAILED);
      await this.eventRepository.recordEvent({
        notificationId,
        eventType: EventType.DELIVERY_FAILED,
        statusBefore,
        statusAfter: NotificationStatus.FAILED,
        executionId: context.jobId,
        metadata: {
          workerId: context.workerId,
          error: error instanceof Error ? error.message : String(error),
          attempt: context.attemptNumber,
          maxAttempts: context.maxAttempts,
          jobId: context.jobId,
        },
      });

      // A retry follows this failed attempt only while attempts remain. This
      // mirrors BullMQ's own shouldRetryJob rule (attemptsMade + 1 < attempts),
      // so RETRY_SCHEDULED is never recorded when the job will actually fail
      // permanently on this attempt.
      if (context.attemptNumber < context.maxAttempts) {
        await this.eventRepository.recordEvent({
          notificationId,
          eventType: EventType.RETRY_SCHEDULED,
          statusBefore: NotificationStatus.FAILED,
          statusAfter: NotificationStatus.FAILED,
          executionId: context.jobId,
          metadata: {
            attempt: context.attemptNumber,
            maxAttempts: context.maxAttempts,
            jobId: context.jobId,
            workerId: context.workerId,
          },
        });
      }

      logger.error(
        { notificationId, jobId: context.jobId, workerId: context.workerId, error },
        'Worker failed to process notification; marked FAILED',
      );
    } catch (markError) {
      logger.error(
        { notificationId, jobId: context.jobId, error: markError },
        'Could not mark notification as FAILED after processing error',
      );
    }
  }

  /**
   * Records the queue-failure path for a notification whose job could not be
   * enqueued. The notification is kept persisted and moved to FAILED so the
   * QUEUED status never lies about the queue state. Best effort: if even the
   * failure bookkeeping fails, the original error is logged and still
   * propagates to the API error handler.
   */
  private async markEnqueueFailed(notificationId: string, error: unknown): Promise<void> {
    try {
      await this.repository.updateNotificationStatus(notificationId, NotificationStatus.FAILED);
      await this.eventRepository.recordEvent({
        notificationId,
        eventType: EventType.DELIVERY_FAILED,
        statusBefore: NotificationStatus.QUEUED,
        statusAfter: NotificationStatus.FAILED,
        metadata: {
          stage: 'enqueue',
          error: error instanceof Error ? error.message : String(error),
        },
      });
      logger.error(
        { notificationId, error },
        'Failed to enqueue notification job; marked notification FAILED',
      );
    } catch (markError) {
      logger.error(
        { notificationId, error: markError },
        'Could not record enqueue failure for notification',
      );
    }
  }

  async createNotification(dto: CreateNotificationDto): Promise<Notification> {
    const user = await this.repository.findUserById(dto.userId);
    if (!user) {
      throw new HttpError('User not found', 400, 'USER_NOT_FOUND', [
        { field: 'userId', message: 'no user exists with the given id' },
      ]);
    }

    const template = await this.repository.findTemplateById(dto.templateId);
    if (!template) {
      throw new HttpError('Template not found', 400, 'TEMPLATE_NOT_FOUND', [
        { field: 'templateId', message: 'no template exists with the given id' },
      ]);
    }

    if (template.channel !== dto.channel) {
      throw new HttpError('Template channel mismatch', 400, 'TEMPLATE_CHANNEL_MISMATCH', [
        {
          field: 'channel',
          message: `template is configured for ${template.channel}, but the request specifies ${dto.channel}`,
        },
      ]);
    }

    const notification = await this.repository.createNotification(dto);

    logger.info(
      { notificationId: notification.id, channel: notification.channel, category: notification.category },
      'Notification created',
    );

    await this.eventRepository.recordEvent({
      notificationId: notification.id,
      eventType: EventType.NOTIFICATION_CREATED,
      statusAfter: NotificationStatus.CREATED,
    });
    await this.eventRepository.recordEvent({
      notificationId: notification.id,
      eventType: EventType.REQUEST_VALIDATED,
      statusBefore: NotificationStatus.CREATED,
      statusAfter: NotificationStatus.CREATED,
    });
    await this.eventRepository.recordEvent({
      notificationId: notification.id,
      eventType: EventType.NOTIFICATION_STORED,
      statusBefore: NotificationStatus.CREATED,
      statusAfter: NotificationStatus.CREATED,
    });

    // Persist QUEUED before the job is enqueued. This guarantees a fast worker
    // can never observe a pre-queue state, and that the QUEUED write can never
    // overwrite a later PROCESSING/DELIVERED write made by the worker.
    const queuedNotification = await this.repository.updateNotificationStatus(
      notification.id,
      NotificationStatus.QUEUED,
    );

    let jobId: string | undefined;
    try {
      jobId = await this.queue.addNotificationJob(notification.id);
    } catch (error) {
      // Queue unavailable (e.g. Redis down): per notification-management.md the
      // notification stays persisted and a queue-failure event is recorded. The
      // API contract (api-specification.md) maps this to HTTP 503 with the
      // QUEUE_UNAVAILABLE error code, so the underlying error is preserved in
      // the event metadata and logs instead of surfacing raw.
      await this.markEnqueueFailed(notification.id, error);
      throw new HttpError('Queue unavailable', 503, 'QUEUE_UNAVAILABLE');
    }
    await this.eventRepository.recordEvent({
      notificationId: notification.id,
      eventType: EventType.JOB_QUEUED,
      statusBefore: NotificationStatus.CREATED,
      statusAfter: NotificationStatus.QUEUED,
      executionId: jobId,
    });

    // Return the accepted (QUEUED) state so the API response is never stale.
    return queuedNotification ?? notification;
  }

  async getNotificationById(notificationId: string): Promise<Notification> {
    const notification = await this.repository.findNotificationById(notificationId);

    if (!notification) {
      throw new HttpError('Notification not found', 404, 'NOT_FOUND', [
        { field: 'notificationId', message: 'no notification exists with the given id' },
      ]);
    }

    return notification;
  }

  async listNotifications(query: ListNotificationsQuery): Promise<PaginatedNotifications> {
    const result = await this.repository.listNotifications(query);

    logger.info(
      { page: query.page, limit: query.limit, total: result.total },
      'Notifications listed',
    );

    return result;
  }

  /**
   * Returns the chronological event history for one notification.
   * Events are read through the event repository abstraction; ordering is
   * occurredAt ASC with id ASC as the deterministic tie-breaker.
   */
  async getNotificationTimeline(notificationId: string): Promise<NotificationEvent[]> {
    const notification = await this.repository.findNotificationById(notificationId);

    if (!notification) {
      throw new HttpError('Notification not found', 404, 'NOT_FOUND', [
        { field: 'notificationId', message: 'no notification exists with the given id' },
      ]);
    }

    return this.eventRepository.listEventsByNotificationId(notificationId);
  }
}