/**
 * Contract implemented by the application layer so the queue worker can invoke
 * notification processing without depending on a concrete service implementation.
 */
export interface NotificationProcessingContext {
  /** BullMQ job id; groups worker events for one execution. */
  jobId: string | undefined;
  /** Name of the BullMQ worker that picked up the job. */
  workerId: string | undefined;
  /**
   * 1-based attempt number of the current processing run
   * (attemptsMade + 1 in BullMQ terms).
   */
  attemptNumber: number;
  /** Total configured attempts for the job (BullMQ opts.attempts). */
  maxAttempts: number;
}

export interface NotificationProcessingService {
  processNotification(notificationId: string, context: NotificationProcessingContext): Promise<void>;
}