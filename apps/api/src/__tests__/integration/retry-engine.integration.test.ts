import { PrismaClient, Channel, Category, Priority, NotificationStatus, EventType } from '@prisma/client';
import { Admin, EachMessagePayload } from 'kafkajs';
import Redis from 'ioredis';
import { cleanTestDatabase, cleanTestRedis, getTestPrisma, createTestUser, createTestTemplate, TestUser, TestTemplate } from './helpers';
import { env } from '../../config/env';
import { createKafkaAdmin } from '../../infrastructure/kafka/kafka-client';
import { initializeKafkaTopics } from '../../infrastructure/kafka/topic-initializer';
import { NotificationConsumer } from '../../infrastructure/kafka/notification-consumer';
import { RetryConsumer } from '../../infrastructure/kafka/retry-consumer';
import { KafkaPublisherSink } from '../../modules/outbox/sinks/kafka-publisher-sink';
import { PrismaOutboxRepository } from '../../modules/outbox/repositories/prisma-outbox-repository';
import { OutboxPublisher } from '../../modules/outbox/services/outbox-publisher';
import { PrismaNotificationRepository } from '../../modules/notifications/repositories/prisma-notification-repository';
import { PrismaNotificationEventRepository } from '../../modules/notifications/repositories/prisma-notification-event-repository';
import { ReplayExecutionRepository } from '../../modules/replay/interfaces/replay-execution-repository';
import { PrismaReplayExecutionRepository } from '../../modules/replay/repositories/prisma-replay-execution-repository';
import { PrismaDeadLetterRepository } from '../../modules/dlq/repositories/prisma-dead-letter-repository';
import { NotificationService } from '../../modules/notifications/services/notification-service';
import { notificationQueue } from '../../infrastructure/queue/notification-queue';
import { RetryScheduler, RETRY_SCHEDULED_KEY, RETRY_PROCESSING_KEY } from '../../modules/retry/services/retry-scheduler';
import { DlqService } from '../../modules/dlq/services/dlq-service';
import { HttpError } from '../../shared/errors/http-error';

describe('Phase 19: Retry Engine & Dead-Letter Queue Integration Tests', () => {
  let prisma: PrismaClient;
  let admin: Admin;
  let testRedis: Redis;
  let kafkaSink: KafkaPublisherSink;
  let outboxRepository: PrismaOutboxRepository;
  let outboxPublisher: OutboxPublisher;
  let notificationRepository: PrismaNotificationRepository;
  let notificationEventRepository: PrismaNotificationEventRepository;
  let replayExecutionRepository: ReplayExecutionRepository;
  let deadLetterRepository: PrismaDeadLetterRepository;
  let notificationService: NotificationService;
  let retryScheduler: RetryScheduler;
  let dlqService: DlqService;
  let primaryConsumer: NotificationConsumer;
  let retryConsumer: RetryConsumer;

  let testUser: TestUser;
  let testTemplate: TestTemplate;
  const originalMode = env.notificationProcessingMode;

  beforeAll(async () => {
    prisma = getTestPrisma();
    admin = createKafkaAdmin();
    await admin.connect();
    await initializeKafkaTopics({ admin });

    testRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1');

    outboxRepository = new PrismaOutboxRepository(prisma);
    kafkaSink = new KafkaPublisherSink();
    await kafkaSink.connect();

    outboxPublisher = new OutboxPublisher(outboxRepository, kafkaSink, {
      batchSize: 10,
      leaseTtlMs: 5000,
      workerId: 'phase19-test-outbox-publisher',
    });

    notificationRepository = new PrismaNotificationRepository(prisma);
    notificationEventRepository = new PrismaNotificationEventRepository(prisma);
    replayExecutionRepository = new PrismaReplayExecutionRepository(prisma);
    deadLetterRepository = new PrismaDeadLetterRepository(prisma);

    notificationService = new NotificationService(
      notificationRepository,
      notificationEventRepository,
      notificationQueue,
    );

    retryScheduler = new RetryScheduler({
      redis: testRedis,
      sink: kafkaSink,
      pollIntervalMs: 100,
      batchSize: 10,
      leaseTtlMs: 5000,
    });

    dlqService = new DlqService(
      deadLetterRepository,
      notificationRepository,
      notificationEventRepository,
      kafkaSink,
    );

    primaryConsumer = new NotificationConsumer(
      notificationService,
      notificationEventRepository,
      replayExecutionRepository,
      {
        groupId: `test-primary-group-${Date.now()}`,
        workerId: 'test-primary-consumer-node',
        retryScheduler,
        dlqService,
        notificationRepository,
      },
    );

    retryConsumer = new RetryConsumer(
      notificationService,
      notificationEventRepository,
      {
        groupId: `test-retry-group-${Date.now()}`,
        workerId: 'test-retry-consumer-node',
        retryScheduler,
        dlqService,
        notificationRepository,
      },
    );
  });

  afterAll(async () => {
    (env as any).notificationProcessingMode = originalMode;
    await outboxPublisher.stop();
    await primaryConsumer.stop();
    await retryConsumer.stop();
    await retryScheduler.stop();
    await kafkaSink.disconnect();
    await admin.disconnect();
    await notificationQueue.close();
    await testRedis.quit();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
    await cleanTestRedis();

    testUser = await createTestUser(prisma);
    testTemplate = await createTestTemplate(prisma, Channel.EMAIL);
  });

  describe('1. Initial Delivery Failure & Retry Scheduling', () => {
    it('should catch transient provider error, schedule 1st retry in Redis, record RETRY_SCHEDULED, and set RETRY_PENDING', async () => {
      (env as any).notificationProcessingMode = 'kafka';

      // 1. Create notification
      const notification = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.HIGH,
        },
        'req-retry-sched-1',
      );

      // 2. Publish to Kafka via outbox
      await outboxPublisher.pollAndPublishOnce();

      const outbox = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: notification.id },
      });

      // 3. Mock delivery processing failure (transient timeout)
      const processSpy = jest
        .spyOn(notificationService, 'processNotification')
        .mockRejectedValueOnce(new HttpError('Provider 504 Gateway Timeout', 504, 'PROVIDER_TIMEOUT'));

      const rawMessage: EachMessagePayload = {
        topic: 'notifications.high',
        partition: 0,
        message: {
          key: Buffer.from(testUser.id),
          value: Buffer.from(JSON.stringify(outbox.payload as Record<string, unknown>)),
          offset: '10',
          timestamp: '1789230000000',
          attributes: 0,
          headers: {
            'x-event-id': Buffer.from(outbox.id),
            'x-event-type': Buffer.from(EventType.NOTIFICATION_CREATED),
            'x-correlation-id': Buffer.from('req-retry-sched-1'),
          },
        },
        heartbeat: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn(),
      };

      // 4. Primary consumer handles message (should not rethrow transient failure)
      await primaryConsumer.handleMessage(rawMessage);

      // 5. Verify Notification state in DB is now RETRY_PENDING
      const updatedNotif = await prisma.notification.findUniqueOrThrow({
        where: { id: notification.id },
      });
      expect(updatedNotif.status).toBe(NotificationStatus.RETRY_PENDING);

      // 6. Verify RETRY_SCHEDULED event in timeline with exact contract
      const events = await notificationEventRepository.listEventsByNotificationId(notification.id);
      const retryScheduledEvent = events.find((e) => e.eventType === EventType.RETRY_SCHEDULED);
      expect(retryScheduledEvent).toBeDefined();
      expect(retryScheduledEvent?.statusBefore).toBe(NotificationStatus.PROCESSING);
      expect(retryScheduledEvent?.statusAfter).toBe(NotificationStatus.RETRY_PENDING);

      const metadata = retryScheduledEvent?.metadata as Record<string, unknown>;
      expect(metadata.attemptNumber).toBe(1);
      expect(metadata.nextAttemptNumber).toBe(2);
      expect(metadata.isRetryable).toBe(true);
      expect(metadata.delayMs).toBeGreaterThanOrEqual(0);

      // 7. Verify Redis ZSET contains scheduled retry job
      const scheduledCount = await testRedis.zcard(RETRY_SCHEDULED_KEY);
      expect(scheduledCount).toBe(1);

      processSpy.mockRestore();
    });
  });

  describe('2. Redis Delay Scheduler & Kafka notifications.retry Publication', () => {
    it('should claim due retries with atomic lease and publish to notifications.retry topic', async () => {
      (env as any).notificationProcessingMode = 'kafka';

      const notification = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.HIGH,
        },
        'req-sched-pub',
      );

      // Schedule directly with past timestamp (due immediately)
      const envelope = {
        eventId: 'evt-sched-1',
        eventType: EventType.NOTIFICATION_CREATED,
        notificationId: notification.id,
        userId: testUser.id,
        templateId: testTemplate.id,
        channel: Channel.EMAIL,
        category: Category.TRANSACTIONAL,
        priority: Priority.HIGH,
        payload: {},
        idempotencyKey: 'idemp-sched-1',
        correlationId: 'req-sched-pub',
        timestamp: new Date().toISOString(),
        retryCount: 1, // 1st retry
        metadata: {
          attemptNumber: 1,
          nextAttemptNumber: 2,
          scheduledAt: new Date().toISOString(),
          scheduledFor: new Date().toISOString(),
          delayMs: 1000,
          reason: '503 Service Unavailable',
          error: '503 Service Unavailable',
        },
      };

      await testRedis.zadd(RETRY_SCHEDULED_KEY, Date.now() - 1000, JSON.stringify(envelope));

      // Poll and publish
      const published = await retryScheduler.pollAndPublishDueRetries();
      expect(published).toBe(1);

      // Verify scheduled ZSET is empty and processing lease is removed (acknowledged)
      const scheduledCount = await testRedis.zcard(RETRY_SCHEDULED_KEY);
      const processingCount = await testRedis.zcard(RETRY_PROCESSING_KEY);
      expect(scheduledCount).toBe(0);
      expect(processingCount).toBe(0);
    });
  });

  describe('3. Retry Consumer: Successful Retry Attempt', () => {
    it('should consume retry message, emit RETRY_STARTED, deliver successfully, and mark DELIVERED', async () => {
      (env as any).notificationProcessingMode = 'kafka';

      const notification = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.NORMAL,
        },
        'req-retry-success',
      );

      // Mark notification as RETRY_PENDING from prior failure
      await notificationRepository.updateNotificationStatus(notification.id, NotificationStatus.RETRY_PENDING);

      const retryMessagePayload = {
        eventId: 'evt-retry-msg-1',
        eventType: EventType.NOTIFICATION_CREATED,
        notificationId: notification.id,
        userId: testUser.id,
        templateId: testTemplate.id,
        channel: Channel.EMAIL,
        category: Category.TRANSACTIONAL,
        priority: Priority.NORMAL,
        payload: {},
        idempotencyKey: 'idemp-retry-1',
        correlationId: 'req-retry-success',
        timestamp: new Date().toISOString(),
        retryCount: 1, // 1st retry -> Attempt 2
        metadata: {
          attemptNumber: 1,
          nextAttemptNumber: 2,
        },
      };

      const rawMessage: EachMessagePayload = {
        topic: 'notifications.retry',
        partition: 0,
        message: {
          key: Buffer.from(testUser.id),
          value: Buffer.from(JSON.stringify(retryMessagePayload)),
          offset: '25',
          timestamp: '1789230000000',
          attributes: 0,
          headers: {
            'x-event-id': Buffer.from('evt-retry-msg-1'),
            'x-correlation-id': Buffer.from('req-retry-success'),
          },
        },
        heartbeat: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn(),
      };

      // Process via RetryConsumer
      await retryConsumer.handleMessage(rawMessage);

      // Verify notification is DELIVERED
      const delivered = await prisma.notification.findUniqueOrThrow({
        where: { id: notification.id },
      });
      expect(delivered.status).toBe(NotificationStatus.DELIVERED);

      // Verify event timeline contains RETRY_STARTED and WORKER_COMPLETED
      const events = await notificationEventRepository.listEventsByNotificationId(notification.id);
      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain(EventType.RETRY_STARTED);
      expect(eventTypes).toContain(EventType.WORKER_STARTED);
      expect(eventTypes).toContain(EventType.WORKER_COMPLETED);
    });
  });

  describe('4. Permanent Failure Immediate DLQ Routing (Attempt 1)', () => {
    it('on permanent error (e.g. 400 Bad Request / template mismatch), should transition directly to DLQ on attempt 1', async () => {
      (env as any).notificationProcessingMode = 'kafka';

      const notification = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.NORMAL,
        },
        'req-perm-dlq',
      );

      await outboxPublisher.pollAndPublishOnce();

      const outbox = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: notification.id },
      });

      // Mock permanent failure
      const processSpy = jest
        .spyOn(notificationService, 'processNotification')
        .mockRejectedValueOnce(new HttpError('Invalid payload schema', 400, 'BAD_REQUEST'));

      const rawMessage: EachMessagePayload = {
        topic: 'notifications.normal',
        partition: 0,
        message: {
          key: Buffer.from(testUser.id),
          value: Buffer.from(JSON.stringify(outbox.payload as Record<string, unknown>)),
          offset: '40',
          timestamp: '1789230000000',
          attributes: 0,
          headers: {},
        },
        heartbeat: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn(),
      };

      await primaryConsumer.handleMessage(rawMessage);

      // Verify Notification status in DB is DLQ
      const dlqNotif = await prisma.notification.findUniqueOrThrow({
        where: { id: notification.id },
      });
      expect(dlqNotif.status).toBe(NotificationStatus.DLQ);

      // Verify durable NotificationDeadLetters record created
      const deadLetter = await prisma.notificationDeadLetter.findUnique({
        where: { notificationId: notification.id },
      });
      expect(deadLetter).toBeDefined();
      expect(deadLetter?.failedAttempts).toBe(1);
      expect(deadLetter?.lastErrorCode).toBe('BAD_REQUEST');

      // Verify DLQ_MOVED event
      const events = await notificationEventRepository.listEventsByNotificationId(notification.id);
      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain(EventType.DLQ_MOVED);

      processSpy.mockRestore();
    });
  });

  describe('5. Max Delivery Attempts Exhaustion (5/5) to DLQ', () => {
    it('when 5th delivery attempt fails, should transition notification to DLQ and persist dead-letter record', async () => {
      (env as any).notificationProcessingMode = 'kafka';

      const notification = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.LOW,
        },
        'req-exhaust-dlq',
      );

      // Mock failure on attempt 5
      const processSpy = jest
        .spyOn(notificationService, 'processNotification')
        .mockRejectedValueOnce(new HttpError('Provider still unavailable', 503, 'SERVICE_UNAVAILABLE'));

      const exhaustedPayload = {
        eventId: 'evt-exhaust-5',
        eventType: EventType.NOTIFICATION_CREATED,
        notificationId: notification.id,
        userId: testUser.id,
        templateId: testTemplate.id,
        channel: Channel.EMAIL,
        category: Category.TRANSACTIONAL,
        priority: Priority.LOW,
        payload: {},
        idempotencyKey: 'idemp-exhaust-5',
        correlationId: 'req-exhaust-dlq',
        timestamp: new Date().toISOString(),
        retryCount: 4, // 4 prior retries -> Attempt 5
        metadata: {
          attemptNumber: 4,
          nextAttemptNumber: 5,
        },
      };

      const rawMessage: EachMessagePayload = {
        topic: 'notifications.retry',
        partition: 0,
        message: {
          key: Buffer.from(testUser.id),
          value: Buffer.from(JSON.stringify(exhaustedPayload)),
          offset: '90',
          timestamp: '1789230000000',
          attributes: 0,
          headers: {},
        },
        heartbeat: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn(),
      };

      await retryConsumer.handleMessage(rawMessage);

      // Verify Notification status is DLQ
      const dlqNotif = await prisma.notification.findUniqueOrThrow({
        where: { id: notification.id },
      });
      expect(dlqNotif.status).toBe(NotificationStatus.DLQ);

      // Verify durable NotificationDeadLetters record created with 5 attempts
      const deadLetter = await prisma.notificationDeadLetter.findUnique({
        where: { notificationId: notification.id },
      });
      expect(deadLetter).toBeDefined();
      expect(deadLetter?.failedAttempts).toBe(5);
      expect(deadLetter?.lastErrorCode).toBe('SERVICE_UNAVAILABLE');

      // Verify DLQ_MOVED event
      const events = await notificationEventRepository.listEventsByNotificationId(notification.id);
      const dlqEvent = events.find((e) => e.eventType === EventType.DLQ_MOVED);
      expect(dlqEvent).toBeDefined();

      processSpy.mockRestore();
    });
  });

  describe('6. Crash Boundary & Lease Recovery Test', () => {
    it('when scheduler crashes after Kafka publication before Redis acknowledgement, lease expiry recovers the job without loss', async () => {
      const envelope = {
        eventId: 'evt-crash-recov',
        eventType: EventType.NOTIFICATION_CREATED,
        notificationId: '00000000-0000-0000-0000-000000000001',
        userId: testUser.id,
        templateId: testTemplate.id,
        channel: Channel.EMAIL,
        category: Category.TRANSACTIONAL,
        priority: Priority.NORMAL,
        payload: {},
        idempotencyKey: 'idemp-crash-1',
        correlationId: 'req-crash-1',
        timestamp: new Date().toISOString(),
        retryCount: 1,
        metadata: {
          attemptNumber: 1,
          nextAttemptNumber: 2,
          scheduledAt: new Date().toISOString(),
          scheduledFor: new Date().toISOString(),
          delayMs: 1000,
          reason: 'Timeout',
          error: 'ETIMEDOUT',
        },
      };

      // Simulate a claimed job in processing queue whose lease has expired (simulating worker crash before ZREM)
      const expiredLeaseTimestamp = Date.now() - 5000;
      await testRedis.zadd(RETRY_PROCESSING_KEY, expiredLeaseTimestamp, JSON.stringify(envelope));

      // Recovery sweep should claim the expired lease item
      const recoveredJobs = await retryScheduler.claimDueRetries(Date.now(), 10, 5000);
      expect(recoveredJobs).toHaveLength(1);
      expect(recoveredJobs[0].eventId).toBe('evt-crash-recov');

      // Complete publication and acknowledgement
      await retryScheduler.acknowledgeRetry(recoveredJobs[0]);
      const processingCount = await testRedis.zcard(RETRY_PROCESSING_KEY);
      expect(processingCount).toBe(0);
    });
  });
});
