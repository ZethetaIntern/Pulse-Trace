/**
 * Queue contract used by the notification module.
 *
 * The notification service depends on this interface instead of BullMQ so the
 * queue technology can be replaced without touching business logic (see the
 * Queue Service abstraction note in initial-docs/system-architecture.md).
 */
export interface QueueService {
  /**
   * Enqueues a background job for the given notification.
   * Resolves with the queue job id, which ties together the queue/worker
   * lifecycle events for that execution.
   */
  addNotificationJob(notificationId: string): Promise<string | undefined>;
}