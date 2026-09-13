import { Channel, Category, Priority, EventType } from '@prisma/client';
import { RetryScheduler, RETRY_SCHEDULED_KEY, RETRY_PROCESSING_KEY, RETRY_TOPIC } from '../../../../modules/retry/services/retry-scheduler';
import { RetryJobEnvelope } from '../../../../modules/retry/interfaces/retry-job-envelope';
import { OutboxPublisherSink } from '../../../../modules/outbox/interfaces/outbox-publisher-sink';

describe('RetryScheduler Unit Tests', () => {
  let mockRedis: any;
  let mockSink: jest.Mocked<OutboxPublisherSink>;
  let scheduler: RetryScheduler;

  const sampleEnvelope: RetryJobEnvelope = {
    eventId: 'evt-retry-1',
    eventType: EventType.NOTIFICATION_CREATED,
    notificationId: 'notif-retry-1',
    userId: 'user-retry-1',
    templateId: 'tmpl-retry-1',
    channel: Channel.EMAIL,
    category: Category.TRANSACTIONAL,
    priority: Priority.HIGH,
    payload: { code: '1234' },
    idempotencyKey: 'idemp-1',
    correlationId: 'corr-1',
    timestamp: new Date().toISOString(),
    retryCount: 1,
    metadata: {
      attemptNumber: 1,
      nextAttemptNumber: 2,
      scheduledAt: new Date().toISOString(),
      scheduledFor: new Date(Date.now() + 2000).toISOString(),
      delayMs: 2000,
      reason: 'Provider timeout',
      error: 'ETIMEDOUT',
    },
  };

  beforeEach(() => {
    mockRedis = {
      zadd: jest.fn().mockResolvedValue(1),
      zrem: jest.fn().mockResolvedValue(1),
      eval: jest.fn().mockResolvedValue([JSON.stringify(sampleEnvelope)]),
      zcard: jest.fn().mockResolvedValue(2),
      quit: jest.fn().mockResolvedValue('OK'),
    };

    mockSink = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    scheduler = new RetryScheduler({
      redis: mockRedis,
      sink: mockSink,
      pollIntervalMs: 100,
      batchSize: 10,
      leaseTtlMs: 5000,
    });
  });

  afterEach(async () => {
    await scheduler.stop();
  });

  it('should schedule a retry into Redis ZSET with target execution timestamp score', async () => {
    const targetTimestamp = await scheduler.scheduleRetry(sampleEnvelope, 2000);

    expect(targetTimestamp).toBeGreaterThan(Date.now());
    expect(mockRedis.zadd).toHaveBeenCalledWith(
      RETRY_SCHEDULED_KEY,
      targetTimestamp,
      JSON.stringify(sampleEnvelope),
    );
  });

  it('should claim due retries atomically via Lua script', async () => {
    const dueJobs = await scheduler.claimDueRetries(Date.now(), 10, 5000);

    expect(dueJobs).toHaveLength(1);
    expect(dueJobs[0].notificationId).toBe(sampleEnvelope.notificationId);
    expect(mockRedis.eval).toHaveBeenCalled();
  });

  it('should publish claimed retries to Kafka topic notifications.retry and acknowledge', async () => {
    const published = await scheduler.pollAndPublishDueRetries();

    expect(published).toBe(1);
    expect(mockSink.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sampleEnvelope.eventId,
        topic: RETRY_TOPIC,
        partitionKey: sampleEnvelope.userId,
      }),
    );
    expect(mockRedis.zrem).toHaveBeenCalledWith(
      RETRY_PROCESSING_KEY,
      JSON.stringify(sampleEnvelope),
    );
  });

  it('should return queue depth metrics', async () => {
    const depth = await scheduler.getQueueDepth();
    expect(depth.scheduled).toBe(2);
    expect(depth.processing).toBe(2);
    expect(depth.total).toBe(4);
  });
});
