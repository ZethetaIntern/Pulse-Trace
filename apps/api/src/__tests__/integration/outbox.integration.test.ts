import { Channel, Category, EventType, NotificationStatus, OutboxStatus, Priority, PrismaClient } from '@prisma/client';
import {
  cleanTestDatabase,
  cleanTestRedis,
  createTestTemplate,
  createTestUser,
  getTestPrisma,
  TestTemplate,
  TestUser,
} from './helpers';
import { PrismaOutboxRepository } from '../../modules/outbox/repositories/prisma-outbox-repository';
import { OutboxPublisher } from '../../modules/outbox/services/outbox-publisher';
import { InMemoryPublisherSink } from '../../modules/outbox/sinks/in-memory-publisher-sink';
import { PrismaNotificationRepository } from '../../modules/notifications/repositories/prisma-notification-repository';
import { PrismaNotificationEventRepository } from '../../modules/notifications/repositories/prisma-notification-event-repository';
import { NotificationService } from '../../modules/notifications/services/notification-service';
import { notificationQueue } from '../../infrastructure/queue/notification-queue';

describe('Transactional Outbox Integration Tests', () => {
  let prisma: PrismaClient;
  let user: TestUser;
  let template: TestTemplate;
  let outboxRepository: PrismaOutboxRepository;
  let notificationRepository: PrismaNotificationRepository;
  let notificationEventRepository: PrismaNotificationEventRepository;
  let notificationService: NotificationService;
  let sink: InMemoryPublisherSink;
  let publisher: OutboxPublisher;

  beforeAll(async () => {
    prisma = getTestPrisma();
    outboxRepository = new PrismaOutboxRepository(prisma);
    notificationRepository = new PrismaNotificationRepository(prisma);
    notificationEventRepository = new PrismaNotificationEventRepository(prisma);
    notificationService = new NotificationService(
      notificationRepository,
      notificationEventRepository,
      notificationQueue,
    );
    sink = new InMemoryPublisherSink();
    publisher = new OutboxPublisher(outboxRepository, sink, {
      batchSize: 10,
      leaseTtlMs: 5000,
      workerId: 'test-outbox-publisher',
    });
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
    await cleanTestRedis();
    sink.clear();

    user = await createTestUser(prisma);
    template = await createTestTemplate(prisma, Channel.EMAIL);
  });

  afterAll(async () => {
    await publisher.stop();
    await notificationQueue.close();
    await cleanTestDatabase(prisma);
  });

  describe('Test 1 — Atomic Creation Success', () => {
    it('should atomically create Notification, NotificationEvents, and OutboxEvent in the same transaction', async () => {
      const notification = await notificationService.createNotification(
        {
          userId: user.id,
          templateId: template.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.HIGH,
          variables: { name: 'Alice', code: '123456' },
          metadata: { correlationId: 'corr-1001', idempotencyKey: 'idemp-1001' },
        },
        'req-atomic-test-1',
      );

      // 1. Assert Notification was created
      expect(notification).toBeDefined();
      expect(notification.id).toBeDefined();
      expect(notification.status).toBe(NotificationStatus.QUEUED);

      // 2. Assert corresponding OutboxEvent was created in the same transaction
      const outboxEvents = await prisma.outboxEvent.findMany({
        where: { aggregateId: notification.id },
      });

      expect(outboxEvents).toHaveLength(1);
      const outbox = outboxEvents[0];
      expect(outbox.aggregateId).toBe(notification.id);
      expect(outbox.aggregateType).toBe('Notification');
      expect(outbox.eventType).toBe(EventType.NOTIFICATION_CREATED);
      expect(outbox.topic).toBe('notifications.high');
      expect(outbox.partitionKey).toBe(user.id);
      expect(outbox.status).toBe(OutboxStatus.PENDING);
      expect(outbox.retryCount).toBe(0);

      // 3. Assert Outbox payload matches the distributed schema contract
      const payload = outbox.payload as Record<string, unknown>;
      expect(payload.notificationId).toBe(notification.id);
      expect(payload.userId).toBe(user.id);
      expect(payload.templateId).toBe(template.id);
      expect(payload.channel).toBe(Channel.EMAIL);
      expect(payload.category).toBe(Category.TRANSACTIONAL);
      expect(payload.priority).toBe(Priority.HIGH);
      expect(payload.idempotencyKey).toBe('idemp-1001');
      expect(payload.correlationId).toBe('req-atomic-test-1');

      // 4. Assert NotificationEvents timeline is complete
      const events = await notificationEventRepository.listEventsByNotificationId(notification.id);
      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain(EventType.NOTIFICATION_CREATED);
      expect(eventTypes).toContain(EventType.REQUEST_VALIDATED);
      expect(eventTypes).toContain(EventType.NOTIFICATION_STORED);
      expect(eventTypes).toContain(EventType.JOB_QUEUED);
    });
  });

  describe('Test 2 — Transaction Rollback Safety', () => {
    it('should roll back both Notification and OutboxEvent if the transaction fails', async () => {
      // Attempt transactional creation with an invalid non-existent foreign key
      await expect(
        notificationRepository.createNotificationTransactional({
          dto: {
            userId: '00000000-0000-0000-0000-000000000000', // Non-existent user
            templateId: template.id,
            channel: Channel.EMAIL,
            category: Category.TRANSACTIONAL,
            priority: Priority.HIGH,
          },
          initialStatus: NotificationStatus.QUEUED,
          outbox: {
            topic: 'notifications.normal',
            partitionKey: 'invalid-user',
            payload: {},
          },
        }),
      ).rejects.toThrow();

      // Assert zero orphaned records exist in database
      const notifCount = await prisma.notification.count();
      const outboxCount = await prisma.outboxEvent.count();
      const eventCount = await prisma.notificationEvent.count();

      expect(notifCount).toBe(0);
      expect(outboxCount).toBe(0);
      expect(eventCount).toBe(0);
    });
  });

  describe('Test 3 — Outbox Publisher Success Lifecycle', () => {
    it('should claim pending event, publish to sink, and transition status to PUBLISHED', async () => {
      const notification = await notificationService.createNotification({
        userId: user.id,
        templateId: template.id,
        channel: Channel.EMAIL,
        category: Category.TRANSACTIONAL,
        priority: Priority.HIGH,
      });

      // Assert outbox is initially PENDING
      const initialOutbox = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: notification.id },
      });
      expect(initialOutbox.status).toBe(OutboxStatus.PENDING);
      expect(initialOutbox.publishedAt).toBeNull();

      // Run publisher single cycle
      const publishedCount = await publisher.pollAndPublishOnce();

      expect(publishedCount).toBe(1);
      expect(sink.getPublishedEvents()).toHaveLength(1);
      expect(sink.getPublishedEvents()[0].id).toBe(initialOutbox.id);

      // Assert DB record transitioned to PUBLISHED with publication timestamp
      const updatedOutbox = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: initialOutbox.id },
      });
      expect(updatedOutbox.status).toBe(OutboxStatus.PUBLISHED);
      expect(updatedOutbox.publishedAt).not.toBeNull();
      expect(updatedOutbox.lockedAt).toBeNull();
      expect(updatedOutbox.lockedBy).toBeNull();
    });
  });

  describe('Test 4 — Outbox Publisher Failure and Retry Tracking', () => {
    it('should mark event FAILED, increment retryCount, and preserve error metadata when sink fails', async () => {
      const notification = await notificationService.createNotification({
        userId: user.id,
        templateId: template.id,
        channel: Channel.EMAIL,
        category: Category.TRANSACTIONAL,
        priority: Priority.HIGH,
      });

      const initialOutbox = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: notification.id },
      });

      // Configure sink to fail
      sink.setShouldFail(true, new Error('Broker connection timeout'));

      const publishedCount = await publisher.pollAndPublishOnce();

      expect(publishedCount).toBe(0);
      expect(sink.getPublishedEvents()).toHaveLength(0);

      // Assert outbox record was marked FAILED with retry count = 1
      const failedOutbox = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: initialOutbox.id },
      });
      expect(failedOutbox.status).toBe(OutboxStatus.FAILED);
      expect(failedOutbox.retryCount).toBe(1);
      expect(failedOutbox.lastError).toContain('Broker connection timeout');
      expect(failedOutbox.lockedAt).toBeNull();

      // Fix sink and re-poll: verify it retries and succeeds on subsequent poll
      sink.setShouldFail(false);
      const retriedCount = await publisher.pollAndPublishOnce();

      expect(retriedCount).toBe(1);
      const recoveredOutbox = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: initialOutbox.id },
      });
      expect(recoveredOutbox.status).toBe(OutboxStatus.PUBLISHED);
      expect(recoveredOutbox.publishedAt).not.toBeNull();
    });
  });

  describe('Test 5 — Concurrent Publisher Claiming (FOR UPDATE SKIP LOCKED)', () => {
    it('should safely distribute pending events across concurrent publishers without double-claiming', async () => {
      // Create 15 notifications and their outbox events
      const notificationIds: string[] = [];
      for (let i = 0; i < 15; i++) {
        const notif = await notificationService.createNotification({
          userId: user.id,
          templateId: template.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.HIGH,
        });
        notificationIds.push(notif.id);
      }

      const sinkA = new InMemoryPublisherSink();
      const sinkB = new InMemoryPublisherSink();

      const publisherA = new OutboxPublisher(outboxRepository, sinkA, {
        batchSize: 8,
        workerId: 'publisher-node-A',
      });
      const publisherB = new OutboxPublisher(outboxRepository, sinkB, {
        batchSize: 8,
        workerId: 'publisher-node-B',
      });

      // Execute polling on both publishers concurrently
      const [countA, countB] = await Promise.all([
        publisherA.pollAndPublishOnce(),
        publisherB.pollAndPublishOnce(),
      ]);

      const totalPublished = countA + countB;
      expect(totalPublished).toBe(15);

      // Verify no intersection between events published by A and B (mutually exclusive batches)
      const eventsA = sinkA.getPublishedEvents().map((e) => e.id);
      const eventsB = sinkB.getPublishedEvents().map((e) => e.id);
      const overlap = eventsA.filter((id) => eventsB.includes(id));

      expect(overlap).toHaveLength(0);
      expect(eventsA.length + eventsB.length).toBe(15);

      // Verify all outbox records in DB are now PUBLISHED
      const publishedInDb = await prisma.outboxEvent.count({
        where: { status: OutboxStatus.PUBLISHED },
      });
      expect(publishedInDb).toBe(15);
    });
  });

  describe('Test 6 — Crash Recovery / Stale Lease Reclamation', () => {
    it('should reclaim and publish an event that was left in PROCESSING by a crashed publisher', async () => {
      const notification = await notificationService.createNotification({
        userId: user.id,
        templateId: template.id,
        channel: Channel.EMAIL,
        category: Category.TRANSACTIONAL,
        priority: Priority.HIGH,
      });

      const outbox = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: notification.id },
      });

      // Simulate a publisher crash 10 minutes ago
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      await prisma.outboxEvent.update({
        where: { id: outbox.id },
        data: {
          status: OutboxStatus.PROCESSING,
          lockedAt: tenMinutesAgo,
          lockedBy: 'crashed-publisher-pod-99',
        },
      });

      // Run publisher with a 5-second lease TTL
      const publishedCount = await publisher.pollAndPublishOnce();

      expect(publishedCount).toBe(1);
      expect(sink.getPublishedEvents()).toHaveLength(1);
      expect(sink.getPublishedEvents()[0].id).toBe(outbox.id);

      const resolved = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: outbox.id },
      });
      expect(resolved.status).toBe(OutboxStatus.PUBLISHED);
      expect(resolved.publishedAt).not.toBeNull();
    });
  });
});
