import { PrismaClient, Channel, Category, Priority, NotificationStatus, EventType, OutboxStatus } from '@prisma/client';
import { Admin, EachMessagePayload } from 'kafkajs';
import { cleanTestDatabase, cleanTestRedis, getTestPrisma, createTestUser, createTestTemplate, TestUser, TestTemplate } from './helpers';
import { env } from '../../config/env';
import { createKafkaAdmin } from '../../infrastructure/kafka/kafka-client';
import { initializeKafkaTopics } from '../../infrastructure/kafka/topic-initializer';
import { NotificationConsumer } from '../../infrastructure/kafka/notification-consumer';
import { KafkaPublisherSink } from '../../modules/outbox/sinks/kafka-publisher-sink';
import { PrismaOutboxRepository } from '../../modules/outbox/repositories/prisma-outbox-repository';
import { OutboxPublisher } from '../../modules/outbox/services/outbox-publisher';
import { PrismaNotificationRepository } from '../../modules/notifications/repositories/prisma-notification-repository';
import { PrismaNotificationEventRepository } from '../../modules/notifications/repositories/prisma-notification-event-repository';
import { PrismaReplayExecutionRepository } from '../../modules/replay/repositories/prisma-replay-execution-repository';
import { NotificationService } from '../../modules/notifications/services/notification-service';
import { notificationQueue } from '../../infrastructure/queue/notification-queue';

describe('Kafka Consumer & Notification Processing Integration Tests', () => {
  let prisma: PrismaClient;
  let admin: Admin;
  let kafkaSink: KafkaPublisherSink;
  let outboxRepository: PrismaOutboxRepository;
  let outboxPublisher: OutboxPublisher;
  let notificationRepository: PrismaNotificationRepository;
  let notificationEventRepository: PrismaNotificationEventRepository;
  let replayExecutionRepository: PrismaReplayExecutionRepository;
  let notificationService: NotificationService;
  let consumer: NotificationConsumer;

  let testUser: TestUser;
  let testTemplate: TestTemplate;
  const originalMode = env.notificationProcessingMode;

  beforeAll(async () => {
    prisma = getTestPrisma();
    admin = createKafkaAdmin();
    await admin.connect();
    await initializeKafkaTopics({ admin });

    outboxRepository = new PrismaOutboxRepository(prisma);
    kafkaSink = new KafkaPublisherSink();
    await kafkaSink.connect();

    outboxPublisher = new OutboxPublisher(outboxRepository, kafkaSink, {
      batchSize: 10,
      leaseTtlMs: 5000,
      workerId: 'kafka-consumer-test-outbox-publisher',
    });

    notificationRepository = new PrismaNotificationRepository(prisma);
    notificationEventRepository = new PrismaNotificationEventRepository(prisma);
    replayExecutionRepository = new PrismaReplayExecutionRepository(prisma);

    notificationService = new NotificationService(
      notificationRepository,
      notificationEventRepository,
      notificationQueue,
    );

    consumer = new NotificationConsumer(
      notificationService,
      notificationEventRepository,
      replayExecutionRepository,
      {
        groupId: `test-integration-group-${Date.now()}`,
        workerId: 'test-kafka-consumer-node',
      },
    );
  });

  afterAll(async () => {
    (env as any).notificationProcessingMode = originalMode;
    await outboxPublisher.stop();
    await consumer.stop();
    await kafkaSink.disconnect();
    await admin.disconnect();
    await notificationQueue.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
    await cleanTestRedis();

    testUser = await createTestUser(prisma);
    testTemplate = await createTestTemplate(prisma, Channel.EMAIL);
  });

  describe('Requirement 1 & 2: Controlled Processing Mode & Duplicate Delivery Prevention', () => {
    it('in BULLMQ mode: should enqueue to BullMQ and emit JOB_QUEUED', async () => {
      (env as any).notificationProcessingMode = 'bullmq';

      const notification = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.HIGH,
        },
        'req-bullmq-mode',
      );

      // Verify notification in DB is QUEUED
      expect(notification.status).toBe(NotificationStatus.QUEUED);

      // Verify events timeline contains JOB_QUEUED
      const events = await notificationEventRepository.listEventsByNotificationId(notification.id);
      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain(EventType.JOB_QUEUED);
      expect(eventTypes).toContain(EventType.NOTIFICATION_CREATED);
    });

    it('in KAFKA mode: should bypass BullMQ and NOT emit JOB_QUEUED', async () => {
      (env as any).notificationProcessingMode = 'kafka';

      const notification = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.HIGH,
        },
        'req-kafka-mode',
      );

      // Verify notification in DB is QUEUED
      expect(notification.status).toBe(NotificationStatus.QUEUED);

      // Verify events timeline does NOT contain JOB_QUEUED
      const events = await notificationEventRepository.listEventsByNotificationId(notification.id);
      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).not.toContain(EventType.JOB_QUEUED);
      expect(eventTypes).toContain(EventType.NOTIFICATION_CREATED);
      expect(eventTypes).toContain(EventType.REQUEST_VALIDATED);
      expect(eventTypes).toContain(EventType.NOTIFICATION_STORED);
    });
  });

  describe('Requirement 3 & 4: End-to-End Kafka Mode Notification Delivery', () => {
    it('should ingest via Kafka mode, publish via Outbox, consume via KafkaConsumer, and deliver', async () => {
      (env as any).notificationProcessingMode = 'kafka';

      // 1. Ingress
      const notification = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.HIGH,
        },
        'req-e2e-kafka-1',
      );

      // 2. Outbox publish to Kafka
      const published = await outboxPublisher.pollAndPublishOnce();
      expect(published).toBe(1);

      const outbox = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: notification.id },
      });
      expect(outbox.status).toBe(OutboxStatus.PUBLISHED);
      expect(outbox.topic).toBe('notifications.high');

      // 3. Construct KafkaMessage payload matching what was published
      const payloadObj = outbox.payload as Record<string, unknown>;
      const rawMessage: EachMessagePayload = {
        topic: 'notifications.high',
        partition: 0,
        message: {
          key: Buffer.from(testUser.id),
          value: Buffer.from(JSON.stringify(payloadObj)),
          offset: '100',
          timestamp: '1789230000000',
          attributes: 0,
          headers: {
            'x-event-id': Buffer.from(outbox.id),
            'x-event-type': Buffer.from(EventType.NOTIFICATION_CREATED),
            'x-correlation-id': Buffer.from('req-e2e-kafka-1'),
          },
        },
        heartbeat: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn(),
      };

      // 4. Process via Consumer
      await consumer.handleMessage(rawMessage);

      // 5. Verify Notification is now DELIVERED in PostgreSQL
      const delivered = await prisma.notification.findUniqueOrThrow({
        where: { id: notification.id },
      });
      expect(delivered.status).toBe(NotificationStatus.DELIVERED);

      // 6. Verify timeline has WORKER_STARTED and WORKER_COMPLETED
      const events = await notificationEventRepository.listEventsByNotificationId(notification.id);
      const eventTypes = events.map((e) => e.eventType);

      expect(eventTypes).toContain(EventType.WORKER_STARTED);
      expect(eventTypes).toContain(EventType.WORKER_COMPLETED);
      expect(eventTypes).not.toContain(EventType.JOB_QUEUED); // Preserved truthful semantics
      expect(eventTypes).not.toContain(EventType.REPLAY_STARTED); // Normal notification, no replay events
    });
  });

  describe('Requirement 5 & 6: Replay Execution Over Kafka Consumer', () => {
    it('should correctly emit REPLAY_STARTED and REPLAY_COMPLETED when message is linked to a ReplayExecution', async () => {
      (env as any).notificationProcessingMode = 'kafka';

      // 1. Create original notification
      const originalNotif = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.NORMAL,
        },
        'req-original',
      );

      // 2. Create replay notification linked to original
      const replayNotif = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.NORMAL,
        },
        'req-replay',
      );

      // Create ReplayExecution link
      const replayExec = await replayExecutionRepository.createReplayExecution({
        originalNotificationId: originalNotif.id,
        reason: 'Integration test replay',
        triggeredBy: 'tester',
      });
      await replayExecutionRepository.updateNewNotificationId(replayExec.id, replayNotif.id);

      // 3. Publish outbox
      await outboxPublisher.pollAndPublishOnce();

      const outbox = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: replayNotif.id },
      });

      // 4. Consume message
      const rawMessage: EachMessagePayload = {
        topic: 'notifications.normal',
        partition: 1,
        message: {
          key: Buffer.from(testUser.id),
          value: Buffer.from(JSON.stringify(outbox.payload as Record<string, unknown>)),
          offset: '200',
          timestamp: '1789230000000',
          attributes: 0,
          headers: {
            'x-event-id': Buffer.from(outbox.id),
            'x-event-type': Buffer.from(EventType.NOTIFICATION_CREATED),
          },
        },
        heartbeat: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn(),
      };

      await consumer.handleMessage(rawMessage);

      // 5. Verify delivered state and replay lifecycle events
      const delivered = await prisma.notification.findUniqueOrThrow({
        where: { id: replayNotif.id },
      });
      expect(delivered.status).toBe(NotificationStatus.DELIVERED);

      const events = await notificationEventRepository.listEventsByNotificationId(replayNotif.id);
      const eventTypes = events.map((e) => e.eventType);

      expect(eventTypes).toContain(EventType.REPLAY_STARTED);
      expect(eventTypes).toContain(EventType.WORKER_STARTED);
      expect(eventTypes).toContain(EventType.WORKER_COMPLETED);
      expect(eventTypes).toContain(EventType.REPLAY_COMPLETED);
    });
  });

  describe('Requirement 7 & 8: Manual Offset Commit and Uncommitted Error Resilience', () => {
    it('should not commit offset if delivery fails, leaving the event recoverable', async () => {
      (env as any).notificationProcessingMode = 'kafka';

      const invalidPayload = {
        eventId: 'evt-fail-test',
        eventType: EventType.NOTIFICATION_CREATED,
        notificationId: '00000000-0000-0000-0000-000000000000', // Non-existent notification
        userId: testUser.id,
        templateId: testTemplate.id,
        channel: Channel.EMAIL,
        category: Category.TRANSACTIONAL,
        priority: Priority.LOW,
        payload: {},
        idempotencyKey: 'idemp-fail',
        correlationId: 'req-fail',
        timestamp: new Date().toISOString(),
        retryCount: 0,
        metadata: {},
      };

      const rawMessage: EachMessagePayload = {
        topic: 'notifications.low',
        partition: 0,
        message: {
          key: Buffer.from(testUser.id),
          value: Buffer.from(JSON.stringify(invalidPayload)),
          offset: '300',
          timestamp: '1789230000000',
          attributes: 0,
          headers: {},
        },
        heartbeat: jest.fn(),
        pause: jest.fn(),
      };

      // Handler must throw and record lastError without committing offset
      await expect(consumer.handleMessage(rawMessage)).rejects.toThrow('not found');
      expect(consumer.getStatus().lastError).toContain('not found');
    });
  });
});
