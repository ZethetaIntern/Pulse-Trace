import { PrismaClient, Channel, Category, Priority, OutboxStatus } from '@prisma/client';
import { Consumer, Admin } from 'kafkajs';
import { cleanTestDatabase, cleanTestRedis, getTestPrisma, createTestUser, createTestTemplate, TestUser, TestTemplate } from './helpers';
import { createKafkaInstance, createKafkaAdmin } from '../../infrastructure/kafka/kafka-client';
import { initializeKafkaTopics, REQUIRED_KAFKA_TOPICS } from '../../infrastructure/kafka/topic-initializer';
import { kafkaHealthIndicator } from '../../infrastructure/kafka/kafka-health-indicator';
import { KafkaPublisherSink } from '../../modules/outbox/sinks/kafka-publisher-sink';
import { PrismaOutboxRepository } from '../../modules/outbox/repositories/prisma-outbox-repository';
import { OutboxPublisher } from '../../modules/outbox/services/outbox-publisher';
import { PrismaNotificationRepository } from '../../modules/notifications/repositories/prisma-notification-repository';
import { PrismaNotificationEventRepository } from '../../modules/notifications/repositories/prisma-notification-event-repository';
import { NotificationService } from '../../modules/notifications/services/notification-service';
import { notificationQueue } from '../../infrastructure/queue/notification-queue';

describe('Kafka Infrastructure Integration Tests', () => {
  let prisma: PrismaClient;
  let admin: Admin;
  let kafkaSink: KafkaPublisherSink;
  let outboxRepository: PrismaOutboxRepository;
  let publisher: OutboxPublisher;
  let notificationRepository: PrismaNotificationRepository;
  let notificationService: NotificationService;

  let testUser: TestUser;
  let testTemplate: TestTemplate;

  beforeAll(async () => {
    prisma = getTestPrisma();
    admin = createKafkaAdmin();
    await admin.connect();

    outboxRepository = new PrismaOutboxRepository(prisma);
    kafkaSink = new KafkaPublisherSink();
    await kafkaSink.connect();

    publisher = new OutboxPublisher(outboxRepository, kafkaSink, {
      batchSize: 10,
      leaseTtlMs: 5000,
      workerId: 'kafka-integration-test-publisher',
    });

    notificationRepository = new PrismaNotificationRepository(prisma);
    const notificationEventRepository = new PrismaNotificationEventRepository(prisma);

    notificationService = new NotificationService(
      notificationRepository,
      notificationEventRepository,
      notificationQueue,
    );
  });

  afterAll(async () => {
    await publisher.stop();
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

  describe('Requirement 1 & 2 & 3: Connectivity & Topic Topology', () => {
    it('should verify Kafka broker health through the health indicator', async () => {
      const health = await kafkaHealthIndicator.checkHealth();
      expect(health.status).toBe('ok');
      expect(health.brokersCount).toBeGreaterThanOrEqual(1);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should idempotently initialize all 5 required topics with 4 partitions each', async () => {
      const initResult = await initializeKafkaTopics({ admin });
      expect(initResult).toBeDefined();

      const metadata = await admin.fetchTopicMetadata({ topics: [...REQUIRED_KAFKA_TOPICS] });
      const createdNames = metadata.topics.map((t) => t.name);

      for (const requiredTopic of REQUIRED_KAFKA_TOPICS) {
        expect(createdNames).toContain(requiredTopic);
        const topicMeta = metadata.topics.find((t) => t.name === requiredTopic);
        expect(topicMeta?.partitions).toHaveLength(4);
      }

      // Verify running initialization again is safe and returns existing topics without failing
      const secondInit = await initializeKafkaTopics({ admin });
      expect(secondInit.createdTopics).toHaveLength(0);
      expect(secondInit.existingTopics).toEqual(expect.arrayContaining([...REQUIRED_KAFKA_TOPICS]));
    });
  });

  describe('Requirement 4, 5, 6, 7: Priority-Based Kafka Topic Routing & Consumption', () => {
    it('should publish HIGH, NORMAL, LOW, and CRITICAL notifications to their respective Kafka topics with partitionKey = userId', async () => {
      // 1. Create notifications of varying priorities
      const highNotif = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.HIGH,
        },
        'corr-high-101',
      );

      const normalNotif = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.NORMAL,
        },
        'corr-norm-202',
      );

      const lowNotif = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.INFORMATIONAL,
          priority: Priority.LOW,
        },
        'corr-low-303',
      );

      const critNotif = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.SECURITY,
          priority: Priority.CRITICAL,
        },
        'corr-crit-404',
      );

      // 2. Poll and publish outbox events to Kafka
      const publishedCount = await publisher.pollAndPublishOnce();
      expect(publishedCount).toBe(4);

      // 3. Verify in database: all 4 outbox records are now PUBLISHED
      const outboxRecords = await prisma.outboxEvent.findMany({
        where: {
          aggregateId: { in: [highNotif.id, normalNotif.id, lowNotif.id, critNotif.id] },
        },
      });

      expect(outboxRecords).toHaveLength(4);
      for (const record of outboxRecords) {
        expect(record.status).toBe(OutboxStatus.PUBLISHED);
        expect(record.publishedAt).not.toBeNull();
        expect(record.lockedAt).toBeNull();
        expect(record.lockedBy).toBeNull();
      }

      // Verify assigned topics
      const highOutbox = outboxRecords.find((r) => r.aggregateId === highNotif.id);
      const normalOutbox = outboxRecords.find((r) => r.aggregateId === normalNotif.id);
      const lowOutbox = outboxRecords.find((r) => r.aggregateId === lowNotif.id);
      const critOutbox = outboxRecords.find((r) => r.aggregateId === critNotif.id);

      expect(highOutbox?.topic).toBe('notifications.high');
      expect(critOutbox?.topic).toBe('notifications.high');
      expect(normalOutbox?.topic).toBe('notifications.normal');
      expect(lowOutbox?.topic).toBe('notifications.low');

      expect(highOutbox?.partitionKey).toBe(testUser.id);
      expect(normalOutbox?.partitionKey).toBe(testUser.id);
      expect(lowOutbox?.partitionKey).toBe(testUser.id);
      expect(critOutbox?.partitionKey).toBe(testUser.id);
    });

    it('should consume published message from Kafka and verify key, payload, and headers', async () => {
      const testCorrelationId = `corr-verify-${Date.now()}`;
      const notification = await notificationService.createNotification(
        {
          userId: testUser.id,
          templateId: testTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.HIGH,
        },
        testCorrelationId,
      );

      const outboxRecord = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: notification.id },
      });

      // Setup a consumer to listen on notifications.high
      const kafka = createKafkaInstance();
      const consumer: Consumer = kafka.consumer({
        groupId: `test-group-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      });

      await consumer.connect();
      await consumer.subscribe({ topic: 'notifications.high', fromBeginning: true });

      const receivedMessages: Array<{
        key: string | null;
        value: string | null;
        headers: Record<string, string>;
      }> = [];

      await consumer.run({
        eachMessage: async ({ message }) => {
          const headers: Record<string, string> = {};
          if (message.headers) {
            for (const [k, v] of Object.entries(message.headers)) {
              if (v) headers[k] = v.toString();
            }
          }
          receivedMessages.push({
            key: message.key ? message.key.toString() : null,
            value: message.value ? message.value.toString() : null,
            headers,
          });
        },
      });

      // Publish the event to Kafka via OutboxPublisher
      await publisher.pollAndPublishOnce();

      // Wait for consumer to receive message (up to 10s)
      const startTime = Date.now();
      while (receivedMessages.length === 0 && Date.now() - startTime < 10000) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      await consumer.disconnect();

      expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
      const matchingMessage = receivedMessages.find(
        (m) => m.headers['x-event-id'] === outboxRecord.id,
      );

      expect(matchingMessage).toBeDefined();
      expect(matchingMessage?.key).toBe(testUser.id);
      expect(matchingMessage?.headers['x-event-type']).toBe('NOTIFICATION_CREATED');
      expect(matchingMessage?.headers['x-correlation-id']).toBe(testCorrelationId);

      const parsedPayload = JSON.parse(matchingMessage!.value!);
      expect(parsedPayload.notificationId).toBe(notification.id);
      expect(parsedPayload.userId).toBe(testUser.id);
      expect(parsedPayload.priority).toBe(Priority.HIGH);
    });
  });

  describe('Requirement 11, 12, 13: Failure Resilience & Outbox Retries', () => {
    it('should mark outbox event FAILED and retain it for retries when Kafka publication fails', async () => {
      const notification = await notificationService.createNotification({
        userId: testUser.id,
        templateId: testTemplate.id,
        channel: Channel.EMAIL,
        category: Category.TRANSACTIONAL,
        priority: Priority.HIGH,
      });

      const initialOutbox = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: notification.id },
      });

      // Create a broken sink pointing to an unreachable broker port
      const failingKafka = createKafkaInstance(['localhost:59999'], 'failing-test-client');
      const failingProducer = failingKafka.producer({
        retry: { retries: 0 },
      });
      const failingSink = new KafkaPublisherSink(failingProducer);

      const failPublisher = new OutboxPublisher(outboxRepository, failingSink, {
        batchSize: 10,
        leaseTtlMs: 5000,
        workerId: 'failing-publisher-node',
      });

      // Polling should catch the failure and not throw
      const published = await failPublisher.pollAndPublishOnce();
      expect(published).toBe(0);

      // Verify the event in DB is FAILED with retryCount = 1
      const failedRecord = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: initialOutbox.id },
      });

      expect(failedRecord.status).toBe(OutboxStatus.FAILED);
      expect(failedRecord.retryCount).toBe(1);
      expect(failedRecord.lastError).toBeTruthy();
      expect(failedRecord.lockedAt).toBeNull();

      // Now poll with the healthy publisher: it should retry and successfully publish to Kafka!
      const recoveredCount = await publisher.pollAndPublishOnce();
      expect(recoveredCount).toBe(1);

      const recoveredRecord = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: initialOutbox.id },
      });
      expect(recoveredRecord.status).toBe(OutboxStatus.PUBLISHED);
      expect(recoveredRecord.publishedAt).not.toBeNull();
    });
  });
});
