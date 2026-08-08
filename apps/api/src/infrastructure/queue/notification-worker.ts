import { Worker } from 'bullmq';
import {
  NotificationProcessingService,
} from '../../modules/notifications/interfaces/notification-processing-service';
import { logger } from '../logger';
import { connection } from './bullmq';
import { NOTIFICATION_JOB_NAME, NOTIFICATION_QUEUE_NAME, NotificationJobData } from './notification-queue';

/**
 * Background consumer for the notification queue.
 *
 * The worker only reads jobs and delegates processing to the application layer
 * (via the injected NotificationProcessingService), so no notification logic
 * lives in the infrastructure layer.
 */
export const NOTIFICATION_WORKER_NAME = 'notification-worker';

export class NotificationWorker {
  private readonly worker: Worker<NotificationJobData>;

  constructor(private readonly processor: NotificationProcessingService) {
    this.worker = new Worker<NotificationJobData>(
      NOTIFICATION_QUEUE_NAME,
      async (job) => {
        if (job.name !== NOTIFICATION_JOB_NAME) {
          logger.warn({ jobId: job.id, name: job.name }, 'Ignoring job with unexpected name');
          return;
        }

        await this.processor.processNotification(job.data.notificationId, {
          jobId: job.id,
          workerId: NOTIFICATION_WORKER_NAME,
        });
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