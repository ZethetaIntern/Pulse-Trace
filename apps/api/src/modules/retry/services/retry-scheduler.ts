import Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { env } from '../../../config/env';
import { logger } from '../../../infrastructure/logger';
import { createRedisClient } from '../../../infrastructure/redis/redis-connection';
import { KafkaPublisherSink } from '../../outbox/sinks/kafka-publisher-sink';
import { OutboxPublisherSink } from '../../outbox/interfaces/outbox-publisher-sink';
import { RetryJobEnvelope } from '../interfaces/retry-job-envelope';

export const RETRY_SCHEDULED_KEY = 'pulsetrace:retry:scheduled';
export const RETRY_PROCESSING_KEY = 'pulsetrace:retry:processing';

export const RETRY_TOPIC = 'notifications.retry';

const CLAIM_DUE_RETRIES_LUA = `
local scheduledKey = KEYS[1]
local processingKey = KEYS[2]
local now = tonumber(ARGV[1])
local batchSize = tonumber(ARGV[2])
local leaseTtlMs = tonumber(ARGV[3])
local leaseExpiry = now + leaseTtlMs

local result = {}

-- 1. Fetch due items from scheduled queue
local due = redis.call('ZRANGEBYSCORE', scheduledKey, '-inf', now, 'LIMIT', 0, batchSize)
for _, item in ipairs(due) do
  redis.call('ZREM', scheduledKey, item)
  redis.call('ZADD', processingKey, leaseExpiry, item)
  table.insert(result, item)
end

-- 2. Recover expired lease items from processing queue if batch has room
local remaining = batchSize - #result
if remaining > 0 then
  local expired = redis.call('ZRANGEBYSCORE', processingKey, '-inf', now, 'LIMIT', 0, remaining)
  for _, item in ipairs(expired) do
    redis.call('ZADD', processingKey, leaseExpiry, item)
    table.insert(result, item)
  end
end

return result
`;

export interface RetrySchedulerOptions {
  redis?: Redis;
  sink?: OutboxPublisherSink;
  pollIntervalMs?: number;
  batchSize?: number;
  leaseTtlMs?: number;
}

export class RetryScheduler {
  private readonly redis: Redis;
  private readonly sink: OutboxPublisherSink;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly leaseTtlMs: number;
  private readonly isExternalRedis: boolean;
  private readonly isExternalSink: boolean;

  private isRunning = false;
  private pollTimeout: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(options: RetrySchedulerOptions = {}) {
    this.isExternalRedis = Boolean(options.redis);
    this.isExternalSink = Boolean(options.sink);

    this.redis = options.redis || createRedisClient();
    this.sink = options.sink || new KafkaPublisherSink();

    this.pollIntervalMs = options.pollIntervalMs ?? env.retrySchedulerPollIntervalMs;
    this.batchSize = options.batchSize ?? env.retrySchedulerBatchSize;
    this.leaseTtlMs = options.leaseTtlMs ?? env.retrySchedulerLeaseTtlMs;
  }

  /**
   * Schedules a retry job into Redis ZSET with target execution timestamp score.
   */
  async scheduleRetry(job: RetryJobEnvelope, delayMs: number): Promise<number> {
    const targetExecutionTimestamp = Date.now() + delayMs;
    const serialized = JSON.stringify(job);

    await this.redis.zadd(RETRY_SCHEDULED_KEY, targetExecutionTimestamp, serialized);

    logger.info(
      {
        notificationId: job.notificationId,
        eventId: job.eventId,
        nextAttempt: job.metadata.nextAttemptNumber,
        delayMs,
        targetExecutionTimestamp,
      },
      'Retry job scheduled in Redis ZSET',
    );

    return targetExecutionTimestamp;
  }

  /**
   * Claims due retry jobs atomically using a Redis Lua script lease.
   */
  async claimDueRetries(
    now: number = Date.now(),
    batchSize: number = this.batchSize,
    leaseTtlMs: number = this.leaseTtlMs,
  ): Promise<RetryJobEnvelope[]> {
    const rawResults = (await this.redis.eval(
      CLAIM_DUE_RETRIES_LUA,
      2,
      RETRY_SCHEDULED_KEY,
      RETRY_PROCESSING_KEY,
      now.toString(),
      batchSize.toString(),
      leaseTtlMs.toString(),
    )) as string[];

    if (!rawResults || rawResults.length === 0) {
      return [];
    }

    const envelopes: RetryJobEnvelope[] = [];
    for (const raw of rawResults) {
      try {
        const envelope = JSON.parse(raw) as RetryJobEnvelope;
        envelopes.push(envelope);
      } catch (err) {
        logger.error({ error: (err as Error).message, raw }, 'Malformed retry envelope in Redis; removing');
        await this.redis.zrem(RETRY_PROCESSING_KEY, raw);
      }
    }

    return envelopes;
  }

  /**
   * Acknowledges successful publication to Kafka by removing the job from the processing lease ZSET.
   */
  async acknowledgeRetry(job: RetryJobEnvelope): Promise<void> {
    const serialized = JSON.stringify(job);
    await this.redis.zrem(RETRY_PROCESSING_KEY, serialized);
  }

  /**
   * Polls ready retries, publishes them to Kafka topic notifications.retry, and acknowledges.
   * Returns count of successfully published retries.
   */
  async pollAndPublishDueRetries(): Promise<number> {
    const claimed = await this.claimDueRetries();
    if (claimed.length === 0) {
      return 0;
    }

    let publishedCount = 0;

    for (const job of claimed) {
      try {
        await this.sink.publish({
          id: job.eventId,
          aggregateType: 'Notification',
          aggregateId: job.notificationId,
          eventType: job.eventType,
          topic: RETRY_TOPIC,
          partitionKey: job.userId,
          payload: job as unknown as Prisma.JsonValue,
          status: 'PENDING',
          retryCount: 0,
          lastError: null,
          lockedAt: null,
          lockedBy: null,
          createdAt: new Date(),
          publishedAt: null,
        });

        await this.acknowledgeRetry(job);
        publishedCount += 1;

        logger.info(
          {
            notificationId: job.notificationId,
            eventId: job.eventId,
            attemptNumber: job.metadata.nextAttemptNumber,
            topic: RETRY_TOPIC,
          },
          'Published due retry job to Kafka notifications.retry',
        );
      } catch (publishError) {
        logger.error(
          {
            notificationId: job.notificationId,
            eventId: job.eventId,
            error: (publishError as Error).message,
          },
          'Failed to publish retry job to Kafka; lease will expire and be recovered',
        );
      }
    }

    return publishedCount;
  }

  /**
   * Starts background polling loop.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (!this.isExternalSink && typeof (this.sink as KafkaPublisherSink).connect === 'function') {
      await (this.sink as KafkaPublisherSink).connect();
    }

    this.isRunning = true;
    logger.info(
      { pollIntervalMs: this.pollIntervalMs, batchSize: this.batchSize },
      'Starting RetryScheduler polling loop...',
    );

    this.scheduleNextPoll();
  }

  private scheduleNextPoll(): void {
    if (!this.isRunning) {
      return;
    }

    this.pollTimeout = setTimeout(async () => {
      if (this.isPolling) {
        this.scheduleNextPoll();
        return;
      }

      this.isPolling = true;
      try {
        await this.pollAndPublishDueRetries();
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Error in RetryScheduler poll cycle');
      } finally {
        this.isPolling = false;
        this.scheduleNextPoll();
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stops the polling loop and disconnects managed resources cleanly.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    logger.info('Stopping RetryScheduler...');

    if (!this.isExternalSink && typeof (this.sink as KafkaPublisherSink).disconnect === 'function') {
      await (this.sink as KafkaPublisherSink).disconnect();
    }

    if (!this.isExternalRedis) {
      await this.redis.quit();
    }

    logger.info('RetryScheduler stopped');
  }

  /**
   * Returns current count of scheduled and in-flight processing retries.
   */
  async getQueueDepth(): Promise<{ scheduled: number; processing: number; total: number }> {
    const [scheduled, processing] = await Promise.all([
      this.redis.zcard(RETRY_SCHEDULED_KEY),
      this.redis.zcard(RETRY_PROCESSING_KEY),
    ]);

    return {
      scheduled,
      processing,
      total: scheduled + processing,
    };
  }
}
