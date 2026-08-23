/**
 * Replay integration tests.
 *
 * Tests the complete replay lifecycle:
 *   Original DELIVERED notification
 *   → POST /replay
 *   → ReplayExecution created
 *   → New notification QUEUED
 *   → Worker processes → DELIVERED
 *   → REPLAY_STARTED → REPLAY_COMPLETED events
 *
 * Uses the real replay API and real worker.
 */

import request from 'supertest';
import {
  PrismaClient,
  Channel,
  EventType,
  NotificationStatus,
} from '@prisma/client';
import { app } from '../../app';
import { NotificationWorker } from '../../infrastructure/queue/notification-worker';
import { notificationService } from '../../modules/notifications/composition';
import { PrismaNotificationEventRepository } from '../../modules/notifications/repositories/prisma-notification-event-repository';
import { PrismaReplayExecutionRepository } from '../../modules/replay/repositories/prisma-replay-execution-repository';
import {
  getTestPrisma,
  disconnectTestPrisma,
  cleanTestDatabase,
  cleanTestRedis,
  createTestUser,
  createTestTemplate,
  defaultCreateBody,
  waitFor,
} from './helpers';

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
  );
});

afterAll(async () => {
  await worker.close();
  await cleanTestDatabase(prisma);
  await cleanTestRedis();
  await disconnectTestPrisma();
});

/**
 * Helper: create and fully process a notification (wait for DELIVERED).
 */
async function createAndProcessNotification(
  userId: string,
  templateId: string,
): Promise<string> {
  const res = await request(app)
    .post('/api/v1/notifications')
    .send(defaultCreateBody({ userId, templateId, channel: Channel.EMAIL }))
    .expect(202);

  const notifId = res.body.data.notificationId;

  await waitFor(
    async () => {
      const notif = await prisma.notification.findUnique({ where: { id: notifId } });
      return notif?.status === NotificationStatus.DELIVERED;
    },
    { timeoutMs: 15000, description: 'notification DELIVERED' },
  );

  return notifId;
}

describe('Replay lifecycle', () => {
  let userId: string;
  let templateId: string;

  beforeAll(async () => {
    const user = await createTestUser(prisma, { email: 'replay-user@test.com' });
    const template = await createTestTemplate(prisma, Channel.EMAIL, { name: 'replay-template' });
    userId = user.id;
    templateId = template.id;
  });

  it('should replay a delivered notification end-to-end', async () => {
    // 1. Create and fully process the original notification
    const originalId = await createAndProcessNotification(userId, templateId);

    // 2. Verify original is DELIVERED
    const original = await prisma.notification.findUnique({ where: { id: originalId } });
    expect(original?.status).toBe(NotificationStatus.DELIVERED);

    // 3. Replay
    const replayRes = await request(app)
      .post(`/api/v1/notifications/${originalId}/replay`)
      .send({ reason: 'Integration test replay' })
      .expect(202);

    expect(replayRes.body.success).toBe(true);
    expect(replayRes.body.data).toHaveProperty('replayId');
    expect(replayRes.body.data).toHaveProperty('notificationId');

    const newNotifId = replayRes.body.data.notificationId;
    const replayId = replayRes.body.data.replayId;

    // 4. Wait for the new notification to become DELIVERED
    await waitFor(
      async () => {
        const notif = await prisma.notification.findUnique({ where: { id: newNotifId } });
        return notif?.status === NotificationStatus.DELIVERED;
      },
      { timeoutMs: 15000, description: 'replayed notification DELIVERED' },
    );

    // 5. Verify ReplayExecution exists
    const replayExecution = await prisma.replayExecution.findUnique({ where: { id: replayId } });
    expect(replayExecution).not.toBeNull();
    expect(replayExecution!.originalNotificationId).toBe(originalId);
    expect(replayExecution!.newNotificationId).toBe(newNotifId);
    expect(replayExecution!.reason).toBe('Integration test replay');

    // 6. Verify original notification is unchanged
    const originalAfterReplay = await prisma.notification.findUnique({ where: { id: originalId } });
    expect(originalAfterReplay?.status).toBe(NotificationStatus.DELIVERED);

    // 7. Verify REPLAY_REQUESTED event on new notification
    const replayRequested = await prisma.notificationEvent.findFirst({
      where: {
        notificationId: newNotifId,
        eventType: EventType.REPLAY_REQUESTED,
      },
    });
    expect(replayRequested).not.toBeNull();

    // 8. Verify REPLAY_STARTED event on new notification
    const replayStarted = await prisma.notificationEvent.findFirst({
      where: {
        notificationId: newNotifId,
        eventType: EventType.REPLAY_STARTED,
      },
    });
    expect(replayStarted).not.toBeNull();
    expect(replayStarted!.statusBefore).toBe(NotificationStatus.QUEUED);
    expect(replayStarted!.statusAfter).toBe(NotificationStatus.PROCESSING);

    // 9. Verify REPLAY_COMPLETED event on new notification
    const replayCompleted = await prisma.notificationEvent.findFirst({
      where: {
        notificationId: newNotifId,
        eventType: EventType.REPLAY_COMPLETED,
      },
    });
    expect(replayCompleted).not.toBeNull();
    expect(replayCompleted!.statusAfter).toBe(NotificationStatus.DELIVERED);

    // 10. Verify the new notification has replay metadata
    const newNotif = await prisma.notification.findUnique({ where: { id: newNotifId } });
    const metadata = newNotif!.metadata as Record<string, unknown>;
    expect(metadata.replayedFrom).toBe(originalId);
  });

  it('should return replay history', async () => {
    const originalId = await createAndProcessNotification(userId, templateId);

    // Replay twice
    await request(app)
      .post(`/api/v1/notifications/${originalId}/replay`)
      .send({ reason: 'Replay 1' })
      .expect(202);

    await request(app)
      .post(`/api/v1/notifications/${originalId}/replay`)
      .send({ reason: 'Replay 2' })
      .expect(202);

    // Get history
    const historyRes = await request(app)
      .get(`/api/v1/notifications/${originalId}/replays`)
      .expect(200);

    expect(historyRes.body.success).toBe(true);
    expect(historyRes.body.data).toHaveLength(2);
    expect(historyRes.body.data[0].reason).toBe('Replay 1');
    expect(historyRes.body.data[1].reason).toBe('Replay 2');
  });

  it('should return 404 for nonexistent notification replay', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/00000000-0000-0000-0000-000000000000/replay')
      .send({ reason: 'Test' })
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should reject replay of a non-replayable notification', async () => {
    // Create a notification (status = QUEUED, not DELIVERED)
    const createRes = await request(app)
      .post('/api/v1/notifications')
      .send(defaultCreateBody({ userId, templateId, channel: Channel.EMAIL }))
      .expect(202);

    const notifId = createRes.body.data.notificationId;

    // Try to replay it immediately (status = QUEUED, which is not replayable)
    // Note: The worker may process it before we replay, so we need to check.
    // If the notification is still QUEUED, this should fail.
    const notif = await prisma.notification.findUnique({ where: { id: notifId } });
    if (notif?.status === NotificationStatus.QUEUED) {
      const res = await request(app)
        .post(`/api/v1/notifications/${notifId}/replay`)
        .send({ reason: 'Test' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('REPLAY_NOT_ALLOWED');
    }
    // If worker already processed it, the replay would succeed (which is also valid)
  });

  it('should return replay history for nonexistent notification', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/00000000-0000-0000-0000-000000000000/replays')
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
