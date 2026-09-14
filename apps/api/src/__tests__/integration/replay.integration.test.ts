/**
 * Replay integration tests.
 *
 * Tests the complete replay lifecycle:
 *   Original DLQ notification
 *   → POST /replay
 *   → ReplayExecution created (REQUESTED)
 *   → New notification QUEUED
 *   → Worker processes → DELIVERED
 *   → REPLAY_STARTED → REPLAY_COMPLETED events
 *   → ReplayExecution updated to COMPLETED
 *   → Original DLQ resolved (resolvedAt set)
 *
 * Uses the real replay API and real worker.
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
import { NotificationWorker } from "../../infrastructure/queue/notification-worker";
import { notificationService } from "../../modules/notifications/composition";
import { PrismaNotificationEventRepository } from "../../modules/notifications/repositories/prisma-notification-event-repository";
import { PrismaReplayExecutionRepository } from "../../modules/replay/repositories/prisma-replay-execution-repository";
import { PrismaDeadLetterRepository } from "../../modules/dlq/repositories/prisma-dead-letter-repository";
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
let worker: NotificationWorker;

beforeAll(async () => {
  prisma = getTestPrisma();
  await cleanTestRedis();
  await cleanTestDatabase(prisma);

  worker = new NotificationWorker(
    notificationService,
    new PrismaNotificationEventRepository(),
    new PrismaReplayExecutionRepository(),
    new PrismaDeadLetterRepository(),
  );
});

afterAll(async () => {
  await worker.close();
  await cleanTestDatabase(prisma);
  await cleanTestRedis();
  await disconnectTestPrisma();
});

/**
 * Helper: create a notification in DLQ status with an unresolved dead letter record.
 */
async function createDlqNotification(
  userId: string,
  templateId: string,
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
      lastErrorCode: "MAX_RETRIES_EXCEEDED",
      lastErrorMessage: "Provider timeout after 5 attempts",
      errorDetails: [{ attempt: 5, error: "Provider timeout" }],
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

describe("Replay lifecycle", () => {
  let userId: string;
  let templateId: string;

  beforeAll(async () => {
    const user = await createTestUser(prisma, { email: "replay-user@test.com" });
    const template = await createTestTemplate(prisma, Channel.EMAIL, { name: "replay-template" });
    userId = user.id;
    templateId = template.id;
  });

  it("should replay a DLQ notification end-to-end", async () => {
    // 1. Create DLQ notification
    const originalId = await createDlqNotification(userId, templateId);

    // 2. Verify original is in DLQ
    const original = await prisma.notification.findUnique({ where: { id: originalId } });
    expect(original?.status).toBe(NotificationStatus.DLQ);

    // 3. Replay
    const replayRes = await request(app)
      .post(`/api/v1/notifications/${originalId}/replay`)
      .send({ reason: "Integration test replay", operatorId: "operator-test" })
      .expect(202);

    expect(replayRes.body.success).toBe(true);
    expect(replayRes.body.data).toHaveProperty("replayId");
    expect(replayRes.body.data).toHaveProperty("notificationId");
    expect(replayRes.body.data.status).toBe(ReplayStatus.REQUESTED);

    const newNotifId = replayRes.body.data.notificationId;
    const replayId = replayRes.body.data.replayId;

    // 4. Wait for the new notification to become DELIVERED
    await waitFor(
      async () => {
        const notif = await prisma.notification.findUnique({ where: { id: newNotifId } });
        return notif?.status === NotificationStatus.DELIVERED;
      },
      { timeoutMs: 15000, description: "replayed notification DELIVERED" },
    );

    // 5. Verify ReplayExecution transitioned to COMPLETED
    await waitFor(
      async () => {
        const replay = await prisma.replayExecution.findUnique({ where: { id: replayId } });
        return replay?.status === ReplayStatus.COMPLETED;
      },
      { timeoutMs: 15000, description: "ReplayExecution COMPLETED" },
    );

    const replayExecution = await prisma.replayExecution.findUnique({ where: { id: replayId } });
    expect(replayExecution).not.toBeNull();
    expect(replayExecution!.originalNotificationId).toBe(originalId);
    expect(replayExecution!.newNotificationId).toBe(newNotifId);
    expect(replayExecution!.reason).toBe("Integration test replay");
    expect(replayExecution!.triggeredBy).toBe("operator-test");
    expect(replayExecution!.status).toBe(ReplayStatus.COMPLETED);
    expect(replayExecution!.completedAt).not.toBeNull();

    // 6. Verify original notification remains in DLQ
    const originalAfterReplay = await prisma.notification.findUnique({ where: { id: originalId } });
    expect(originalAfterReplay?.status).toBe(NotificationStatus.DLQ);

    // 7. Verify original dead letter record is resolved
    const dlqRecord = await prisma.notificationDeadLetter.findUnique({
      where: { notificationId: originalId },
    });
    expect(dlqRecord?.resolvedAt).not.toBeNull();

    // 8. Verify REPLAY_REQUESTED, REPLAY_STARTED, and REPLAY_COMPLETED events
    const replayRequested = await prisma.notificationEvent.findFirst({
      where: { notificationId: newNotifId, eventType: EventType.REPLAY_REQUESTED },
    });
    expect(replayRequested).not.toBeNull();

    const replayStarted = await prisma.notificationEvent.findFirst({
      where: { notificationId: newNotifId, eventType: EventType.REPLAY_STARTED },
    });
    expect(replayStarted).not.toBeNull();

    const replayCompleted = await prisma.notificationEvent.findFirst({
      where: { notificationId: newNotifId, eventType: EventType.REPLAY_COMPLETED },
    });
    expect(replayCompleted).not.toBeNull();

    // 9. Verify replayed notification has clean metadata
    const newNotif = await prisma.notification.findUnique({ where: { id: newNotifId } });
    const meta = newNotif!.metadata as Record<string, unknown>;
    expect(meta.replayedFrom).toBe(originalId);
  });

  it("should return replay history", async () => {
    const originalId = await createDlqNotification(userId, templateId);

    // First replay
    const res1 = await request(app)
      .post(`/api/v1/notifications/${originalId}/replay`)
      .send({ reason: "Replay 1" })
      .expect(202);

    // Wait for first replay to complete
    await waitFor(
      async () => {
        const notif = await prisma.notification.findUnique({ where: { id: res1.body.data.notificationId } });
        return notif?.status === NotificationStatus.DELIVERED;
      },
      { timeoutMs: 15000, description: "first replay DELIVERED" },
    );

    // Second replay (allowed since first one is completed)
    const res2 = await request(app)
      .post(`/api/v1/notifications/${originalId}/replay`)
      .send({ reason: "Replay 2" })
      .expect(202);

    await waitFor(
      async () => {
        const notif = await prisma.notification.findUnique({ where: { id: res2.body.data.notificationId } });
        return notif?.status === NotificationStatus.DELIVERED;
      },
      { timeoutMs: 15000, description: "second replay DELIVERED" },
    );

    // Get history
    const historyRes = await request(app)
      .get(`/api/v1/notifications/${originalId}/replays`)
      .expect(200);

    expect(historyRes.body.success).toBe(true);
    expect(historyRes.body.data).toHaveLength(2);
  });

  it("should prevent concurrent active replays for the same original notification", async () => {
    const originalId = await createDlqNotification(userId, templateId);

    // Replay 1
    await request(app)
      .post(`/api/v1/notifications/${originalId}/replay`)
      .send({ reason: "First replay" })
      .expect(202);

    // Replay 2 immediately while Replay 1 is REQUESTED / RUNNING
    const active = await prisma.replayExecution.findFirst({
      where: {
        originalNotificationId: originalId,
        status: { in: [ReplayStatus.REQUESTED, ReplayStatus.RUNNING] },
      },
    });

    if (active) {
      const res2 = await request(app)
        .post(`/api/v1/notifications/${originalId}/replay`)
        .send({ reason: "Second active replay" });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe("ACTIVE_REPLAY_EXISTS");
    }
  });

  it("should return 404 for nonexistent notification replay", async () => {
    const res = await request(app)
      .post("/api/v1/notifications/00000000-0000-0000-0000-000000000000/replay")
      .send({ reason: "Test" })
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("should reject replay of a non-DLQ notification", async () => {
    const notif = await prisma.notification.create({
      data: {
        userId,
        templateId,
        channel: Channel.EMAIL,
        category: Category.TRANSACTIONAL,
        priority: Priority.NORMAL,
        payload: { name: "Bob" },
        status: NotificationStatus.DELIVERED,
      },
    });

    const res = await request(app)
      .post(`/api/v1/notifications/${notif.id}/replay`)
      .send({ reason: "Test" })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("REPLAY_NOT_ALLOWED");
  });
});
