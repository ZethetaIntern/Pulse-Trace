/**
 * Phase 20 Integration Tests: DLQ & Operator Replay Pipeline
 *
 * Tests end-to-end:
 * 1. DLQ inspection via GET /api/v1/notifications/:id/dlq
 * 2. DLQ Replay Trigger via POST /api/v1/notifications/:id/replay
 * 3. Outbox Publisher -> Kafka -> NotificationConsumer replay execution flow:
 *    - REQUESTED -> RUNNING -> COMPLETED
 *    - REPLAY_STARTED -> REPLAY_COMPLETED events
 *    - Deferred DLQ resolution (resolvedAt stamped only on DELIVERED)
 * 4. Partial Unique Index race condition guard (rejects concurrent active replays with 409)
 * 5. DLQ restriction invariant (rejects non-DLQ replay with 400)
 */

import request from "supertest";
import {
  PrismaClient,
  Channel,
  Category,
  Priority,
  EventType,
  NotificationStatus,
  ReplayStatus,
} from "@prisma/client";
import { app } from "../../app";
import { env } from "../../config/env";
import { createKafkaAdmin } from "../../infrastructure/kafka/kafka-client";
import { initializeKafkaTopics } from "../../infrastructure/kafka/topic-initializer";
import { NotificationConsumer } from "../../infrastructure/kafka/notification-consumer";
import { KafkaPublisherSink } from "../../modules/outbox/sinks/kafka-publisher-sink";
import { PrismaOutboxRepository } from "../../modules/outbox/repositories/prisma-outbox-repository";
import { OutboxPublisher } from "../../modules/outbox/services/outbox-publisher";
import { PrismaNotificationRepository } from "../../modules/notifications/repositories/prisma-notification-repository";
import { PrismaNotificationEventRepository } from "../../modules/notifications/repositories/prisma-notification-event-repository";
import { PrismaReplayExecutionRepository } from "../../modules/replay/repositories/prisma-replay-execution-repository";
import { PrismaDeadLetterRepository } from "../../modules/dlq/repositories/prisma-dead-letter-repository";
import { NotificationService } from "../../modules/notifications/services/notification-service";
import { notificationQueue } from "../../infrastructure/queue/notification-queue";
import {
  getTestPrisma,
  disconnectTestPrisma,
  cleanTestDatabase,
  cleanTestRedis,
  createTestUser,
  createTestTemplate,
  waitFor,
} from "./helpers";

let prisma: PrismaClient;
let originalMode: "bullmq" | "kafka";
let kafkaSink: KafkaPublisherSink;
let outboxPublisher: OutboxPublisher;
let notificationService: NotificationService;
let consumer: NotificationConsumer;
let deadLetterRepo: PrismaDeadLetterRepository;

beforeAll(async () => {
  originalMode = env.notificationProcessingMode;
  (env as any).notificationProcessingMode = "kafka";

  prisma = getTestPrisma();
  await cleanTestRedis();
  await cleanTestDatabase(prisma);

  const admin = createKafkaAdmin();
  await admin.connect();
  await initializeKafkaTopics({ admin });
  await admin.disconnect();

  const outboxRepo = new PrismaOutboxRepository(prisma);
  kafkaSink = new KafkaPublisherSink();
  await kafkaSink.connect();

  outboxPublisher = new OutboxPublisher(outboxRepo, kafkaSink, {
    batchSize: 10,
    leaseTtlMs: 5000,
    workerId: "dlq-replay-outbox-publisher",
  });

  const notifRepo = new PrismaNotificationRepository(prisma);
  const eventRepo = new PrismaNotificationEventRepository(prisma);
  const replayRepo = new PrismaReplayExecutionRepository(prisma);
  deadLetterRepo = new PrismaDeadLetterRepository(prisma);

  notificationService = new NotificationService(
    notifRepo,
    eventRepo,
    notificationQueue,
  );

  consumer = new NotificationConsumer(
    notificationService,
    eventRepo,
    replayRepo,
    {
      deadLetterRepository: deadLetterRepo,
      notificationRepository: notifRepo,
      groupId: "test-dlq-replay-group",
      workerId: "dlq-replay-test-worker",
    },
  );

  await consumer.start();
});

afterAll(async () => {
  (env as any).notificationProcessingMode = originalMode;
  if (consumer) await consumer.stop();
  if (kafkaSink) await kafkaSink.disconnect();
  await cleanTestDatabase(prisma);
  await cleanTestRedis();
  await disconnectTestPrisma();
});

async function createDlqNotification(
  userId: string,
  templateId: string,
  overrides: { errorCode?: string; errorMessage?: string } = {},
): Promise<string> {
  const notif = await prisma.notification.create({
    data: {
      userId,
      templateId,
      channel: Channel.EMAIL,
      category: Category.TRANSACTIONAL,
      priority: Priority.NORMAL,
      payload: { name: "Alice", email: "alice@test.com" },
      metadata: { retryCount: 5 },
      status: NotificationStatus.DLQ,
    },
  });

  await prisma.notificationDeadLetter.create({
    data: {
      notificationId: notif.id,
      originalPayload: { name: "Alice", email: "alice@test.com" },
      failedAttempts: 5,
      lastErrorCode: overrides.errorCode ?? "MAX_RETRIES_EXCEEDED",
      lastErrorMessage: overrides.errorMessage ?? "Provider timed out after 5 attempts",
      errorDetails: [{ attempt: 5, error: overrides.errorMessage ?? "Provider timed out" }],
    },
  });

  await prisma.notificationEvent.create({
    data: {
      notificationId: notif.id,
      eventType: EventType.DLQ_MOVED,
      statusBefore: NotificationStatus.PROCESSING,
      statusAfter: NotificationStatus.DLQ,
      metadata: { failedAttempts: 5 },
    },
  });

  return notif.id;
}

describe("DLQ & Operator Replay Pipeline (Phase 20)", () => {
  let userId: string;
  let templateId: string;

  beforeAll(async () => {
    const user = await createTestUser(prisma, { email: "dlq-replay-user@test.com" });
    const template = await createTestTemplate(prisma, Channel.EMAIL, { name: "dlq-replay-template" });
    userId = user.id;
    templateId = template.id;
  });

  it("GET /api/v1/notifications/:id/dlq returns durable dead-letter record", async () => {
    const originalId = await createDlqNotification(userId, templateId, {
      errorCode: "SMTP_CONNECT_FAILED",
      errorMessage: "Could not connect to SMTP server",
    });

    const res = await request(app)
      .get(`/api/v1/notifications/${originalId}/dlq`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      notificationId: originalId,
      failedAttempts: 5,
      lastErrorCode: "SMTP_CONNECT_FAILED",
      lastErrorMessage: "Could not connect to SMTP server",
      resolvedAt: null,
      resolvedBy: null,
    });
  });

  it("POST /api/v1/notifications/:id/replay triggers atomic Outbox + ReplayExecution in Kafka mode", async () => {
    const originalId = await createDlqNotification(userId, templateId);

    const res = await request(app)
      .post(`/api/v1/notifications/${originalId}/replay`)
      .send({ reason: "SMTP recovered", operatorId: "operator-sid" })
      .expect(202);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(ReplayStatus.REQUESTED);
    const newNotifId = res.body.data.notificationId;
    const replayId = res.body.data.replayId;

    // 1. Verify DB records created atomically
    const newNotif = await prisma.notification.findUnique({ where: { id: newNotifId } });
    expect(newNotif).not.toBeNull();
    expect(newNotif!.status).toBe(NotificationStatus.QUEUED);
    const notifMeta = newNotif!.metadata as Record<string, unknown>;
    expect(notifMeta.replayedFrom).toBe(originalId);

    const replayExec = await prisma.replayExecution.findUnique({ where: { id: replayId } });
    expect(replayExec).not.toBeNull();
    expect(replayExec!.status).toBe(ReplayStatus.REQUESTED);
    expect(replayExec!.triggeredBy).toBe("operator-sid");
    expect(replayExec!.reason).toBe("SMTP recovered");

    const outbox = await prisma.outboxEvent.findFirst({
      where: { aggregateId: newNotifId },
    });
    expect(outbox).not.toBeNull();
    expect(outbox!.status).toBe("PENDING");
    expect(outbox!.topic).toBe("notifications.normal");
  });

  it("End-to-End Kafka Flow: Replay -> Outbox Publisher -> Kafka Consumer -> DELIVERED -> COMPLETED -> DLQ Resolved", async () => {
    const originalId = await createDlqNotification(userId, templateId);

    const res = await request(app)
      .post(`/api/v1/notifications/${originalId}/replay`)
      .send({ reason: "Full E2E replay test", operatorId: "operator-e2e" })
      .expect(202);

    const newNotifId = res.body.data.notificationId;
    const replayId = res.body.data.replayId;

    // Run Outbox Publisher cycle to publish event to Kafka
    await outboxPublisher.pollAndPublishOnce();

    // Verify Outbox is PUBLISHED
    const outbox = await prisma.outboxEvent.findFirst({ where: { aggregateId: newNotifId } });
    expect(outbox?.status).toBe("PUBLISHED");

    // Wait for ReplayExecution to become COMPLETED via Kafka Consumer
    await waitFor(
      async () => {
        const replay = await prisma.replayExecution.findUnique({ where: { id: replayId } });
        return replay?.status === ReplayStatus.COMPLETED;
      },
      { timeoutMs: 25000, description: "ReplayExecution COMPLETED" },
    );

    // Verify new notification reached DELIVERED
    const finalNotif = await prisma.notification.findUnique({ where: { id: newNotifId } });
    expect(finalNotif?.status).toBe(NotificationStatus.DELIVERED);

    // Verify ReplayExecution fields
    const finalReplay = await prisma.replayExecution.findUnique({ where: { id: replayId } });
    expect(finalReplay?.status).toBe(ReplayStatus.COMPLETED);
    expect(finalReplay?.startedAt).not.toBeNull();
    expect(finalReplay?.completedAt).not.toBeNull();

    // Verify REPLAY_REQUESTED, REPLAY_STARTED, and REPLAY_COMPLETED events
    const startedEvent = await prisma.notificationEvent.findFirst({
      where: { notificationId: newNotifId, eventType: EventType.REPLAY_STARTED },
    });
    expect(startedEvent).not.toBeNull();

    const completedEvent = await prisma.notificationEvent.findFirst({
      where: { notificationId: newNotifId, eventType: EventType.REPLAY_COMPLETED },
    });
    expect(completedEvent).not.toBeNull();

    // Verify original DLQ record is resolved
    const originalDlq = await prisma.notificationDeadLetter.findUnique({
      where: { notificationId: originalId },
    });
    expect(originalDlq?.resolvedAt).not.toBeNull();
    expect(originalDlq?.resolvedBy).toBe("operator-e2e");
  }, 35000);

  it("Partial unique index prevents concurrent active replays for the same original notification", async () => {
    const originalId = await createDlqNotification(userId, templateId);

    // Replay 1
    const res1 = await request(app)
      .post(`/api/v1/notifications/${originalId}/replay`)
      .send({ reason: "First active replay", operatorId: "op-1" })
      .expect(202);

    expect(res1.body.data.status).toBe(ReplayStatus.REQUESTED);

    // Replay 2 while Replay 1 is still active (REQUESTED)
    const res2 = await request(app)
      .post(`/api/v1/notifications/${originalId}/replay`)
      .send({ reason: "Second concurrent replay", operatorId: "op-2" });

    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe("ACTIVE_REPLAY_EXISTS");
  });

  it("Rejects replay of a non-DLQ notification with 400 REPLAY_NOT_ALLOWED", async () => {
    const deliveredNotif = await prisma.notification.create({
      data: {
        userId,
        templateId,
        channel: Channel.EMAIL,
        category: Category.TRANSACTIONAL,
        priority: Priority.NORMAL,
        payload: { name: "NonDLQ" },
        status: NotificationStatus.DELIVERED,
      },
    });

    const res = await request(app)
      .post(`/api/v1/notifications/${deliveredNotif.id}/replay`)
      .send({ reason: "Should fail" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("REPLAY_NOT_ALLOWED");
  });
});
