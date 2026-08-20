import { Worker } from 'bullmq';
import { EventType, NotificationStatus } from '@prisma/client';
import {
  NotificationProcessingService,
} from '../../modules/notifications/interfaces/notification-processing-service';
import { NotificationEventRepository } from '../../modules/notifications/interfaces/notification-event-repository';
import { ReplayExecutionRepository } from '../../modules/replay/interfaces/replay-execution-repository';
import { logger } from '../logger';
import { connection } from './bullmq';
import { NOTIFICATION_JOB_NAME, NOTIFICATION_QUEUE_NAME, NotificationJobData } from './notification-queue';

/**
 * Background consumer for the notification queue.
 *
 * The worker only reads jobs and delegates processing to the application layer
 * (via the injected NotificationProcessingService), so no notification logic
 * lives in the infrastructure layer.
 *
 * For replayed notifications, the worker also emits REPLAY_STARTED and
 * REPLAY_COMPLETED lifecycle events on the NEW notification's timeline,
 * bridging the normal processing pipeline with the replay system.
 */
export const NOTIFICATION_WORKER_NAME = 'notification-worker';

export class NotificationWorker {
  private readonly worker: Worker<NotificationJobData>;

  constructor(
    private readonly processor: NotificationProcessingService,
    private readonly eventRepository: NotificationEventRepository,
    private readonly replayExecutionRepository: ReplayExecutionRepository,
  ) {
    this.worker = new Worker<NotificationJobData>(
      NOTIFICATION_QUEUE_NAME,
      async (job) => {
        if (job.name !== NOTIFICATION_JOB_NAME) {
          logger.warn({ jobId: job.id, name: job.name }, 'Ignoring job with unexpected name');
          return;
        }

        const notificationId = job.data.notificationId;

        // Detect whether this notification belongs to a replay execution.
        // Original notifications have no ReplayExecution record pointing to them;
        // replayed notifications are linked via newNotificationId.
        const replayExecution = await this.replayExecutionRepository
          .findReplayExecutionByNewNotificationId(notificationId);

        if (replayExecution) {
          // REPLAY_STARTED represents the beginning of replay execution.
          // The notification status was QUEUED when the job was picked up;
          // it transitions to PROCESSING as part of normal processing.
          await this.eventRepository.recordEvent({
            notificationId,
            eventType: EventType.REPLAY_STARTED,
            statusBefore: NotificationStatus.QUEUED,
            statusAfter: NotificationStatus.PROCESSING,
            executionId: job.id,
            metadata: {
              originalNotificationId: replayExecution.originalNotificationId,
              replayId: replayExecution.id,
              workerId: NOTIFICATION_WORKER_NAME,
            },
          });
        }

        // Delegate to the normal notification processing pipeline.
        await this.processor.processNotification(notificationId, {
          jobId: job.id,
          workerId: NOTIFICATION_WORKER_NAME,
          attemptNumber: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts ?? 1,
        });

        // REPLAY_COMPLETED only after successful processing.
        // On delivery failure, processNotification throws, so this line is
        // skipped — matching the spec: "On delivery failure, do NOT emit
        // REPLAY_COMPLETED."
        if (replayExecution) {
          await this.eventRepository.recordEvent({
            notificationId,
            eventType: EventType.REPLAY_COMPLETED,
            statusBefore: NotificationStatus.DELIVERED,
            statusAfter: NotificationStatus.DELIVERED,
            executionId: job.id,
            metadata: {
              originalNotificationId: replayExecution.originalNotificationId,
              replayId: replayExecution.id,
              workerId: NOTIFICATION_WORKER_NAME,
            },
          });
        }
      },
      {
        connection,
        concurrency: 1,
        name: NOTIFICATION_WORKER_NAME,
      },
    );

    this.worker.on('completed', (job) => {
      logger.info({ jobId: job.id, notificationId: job.data.notificationId }, 'Worker completed job');
    });

    this.worker.on('failed', (job, error) => {
      logger.error(
        { jobId: job?.id, notificationId: job?.data.notificationId, error },
        'Worker failed to process job',
      );
    });

    this.worker.on('error', (error) => {
      logger.error({ error }, 'Notification worker error');
    });
  }

  close(): Promise<void> {
    return this.worker.close();
  }
}