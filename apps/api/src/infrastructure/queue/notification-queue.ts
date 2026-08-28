import { Job, Queue } from 'bullmq';
import { env } from '../../config/env';
import { QueueService } from '../../modules/notifications/interfaces/queue-service';
import { logger } from '../logger';
import { connection } from './bullmq';

export const NOTIFICATION_QUEUE_NAME = 'notifications';
export const NOTIFICATION_JOB_NAME = 'process-notification';
export const NOTIFICATION_WORKER_NAME = 'notification-worker';

/** Lightweight payload moved through the queue. The worker loads the rest of the data from the database. */
export interface NotificationJobData {
  notificationId: string;
}

/**
 * BullMQ-backed notification queue.
 *
 * Implements the module's QueueService contract. All queue configuration lives
 * in infrastructure/queue; no notification business logic lives here.
 */
export class NotificationQueue implements QueueService {
  private readonly queue: Queue<NotificationJobData>;

  constructor() {
    this.queue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
      connection,
    });

    this.queue.on('error', (error) => {
      logger.error({ error }, 'Notification queue error');
    });
  }

  async addNotificationJob(notificationId: string): Promise<string | undefined> {
    const job: Job<NotificationJobData> = await this.queue.add(
      NOTIFICATION_JOB_NAME,
      { notificationId },
      {
        // Retention TTLs prevent unbounded Redis memory growth.
        // Completed jobs are kept for 1 day; failed jobs for 7 days to
        // allow debugging and replay inspection.
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 604_800 },
        // Configurable retry policy: attempts with exponential backoff.
        // A dedicated DLQ belongs to the reliability/replay milestone and is
        // intentionally not built here (see roadmap Phase 3 tasks).
        attempts: env.queueAttempts,
        backoff: { type: 'exponential', delay: env.queueBackoffMs },
      },
    );

    logger.info({ notificationId, jobId: job.id }, 'Notification job enqueued');

    return job.id;
  }

  close(): Promise<void> {
    return this.queue.close();
  }
}

/** Shared queue instance wired into the application at the composition root. */
export const notificationQueue = new NotificationQueue();