import { logger } from '../../../infrastructure/logger';
import { sanitizeErrorMessage } from '../../../shared/utils/sanitize-error';
import { OutboxPublisherSink } from '../interfaces/outbox-publisher-sink';
import { OutboxRepository } from '../interfaces/outbox-repository';

export interface OutboxPublisherOptions {
  batchSize?: number;
  pollIntervalMs?: number;
  leaseTtlMs?: number;
  workerId?: string;
}

/**
 * Transactional Outbox Publisher.
 *
 * Continuously polls unpublished outbox rows using FOR UPDATE SKIP LOCKED,
 * dispatches them through the abstract OutboxPublisherSink, and marks them PUBLISHED.
 *
 * Implements lease timeout recovery so claimed events whose publisher crashes
 * are recovered automatically in subsequent polling cycles.
 */
export class OutboxPublisher {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    private readonly repository: OutboxRepository,
    private readonly sink: OutboxPublisherSink,
    private readonly options: OutboxPublisherOptions = {},
  ) {}

  /**
   * Polls and publishes a single batch of outbox events.
   * Returns the count of successfully published events.
   */
  async pollAndPublishOnce(): Promise<number> {
    const batchSize = this.options.batchSize ?? 50;
    const leaseTtlMs = this.options.leaseTtlMs ?? 30_000;
    const workerId = this.options.workerId ?? `outbox-publisher-${process.pid}`;

    const claimedEvents = await this.repository.claimBatch(batchSize, leaseTtlMs, workerId);
    if (claimedEvents.length === 0) {
      return 0;
    }

    let publishedCount = 0;

    for (const event of claimedEvents) {
      try {
        await this.sink.publish(event);
        await this.repository.markPublished(event.id);
        publishedCount++;
        logger.debug({ eventId: event.id, topic: event.topic }, 'Outbox event published');
      } catch (error) {
        const errorMsg = sanitizeErrorMessage(error);
        const nextRetryCount = event.retryCount + 1;
        await this.repository.markFailed(event.id, errorMsg, nextRetryCount);
        logger.error(
          { eventId: event.id, topic: event.topic, retryCount: nextRetryCount, error: errorMsg },
          'Failed to publish outbox event; marked FAILED',
        );
      }
    }

    return publishedCount;
  }

  /**
   * Starts the background polling timer.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Outbox publisher started');

    // Run first poll cycle immediately, then schedule subsequent intervals
    void (async () => {
      if (!this.isRunning) return;
      this.isPolling = true;
      try {
        await this.pollAndPublishOnce();
      } catch (error) {
        logger.error({ error }, 'Error in outbox publisher polling cycle');
      } finally {
        this.isPolling = false;
        this.scheduleNextPoll();
      }
    })();
  }

  /**
   * Stops the background polling timer and awaits completion of any in-flight poll cycle.
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Await currently executing poll cycle to finish
    while (this.isPolling) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    logger.info('Outbox publisher stopped');
  }

  private scheduleNextPoll(): void {
    if (!this.isRunning) return;
    const interval = this.options.pollIntervalMs ?? 500;

    this.timer = setTimeout(async () => {
      if (!this.isRunning) return;
      this.isPolling = true;
      try {
        await this.pollAndPublishOnce();
      } catch (error) {
        logger.error({ error }, 'Error in outbox publisher polling cycle');
      } finally {
        this.isPolling = false;
        this.scheduleNextPoll();
      }
    }, interval);
  }
}
