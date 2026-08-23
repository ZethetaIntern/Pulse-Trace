/**
 * Full async pipeline integration tests.
 *
 * Tests the complete lifecycle:
 *   HTTP request → PostgreSQL → BullMQ → Worker → PROCESSING → DELIVERED → events
 *
 * Uses the REAL NotificationWorker with real Redis and PostgreSQL.
 */

import request from 'supertest';
import { PrismaClient, Channel, NotificationStatus } from '@prisma/client';
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

describe('Full notification pipeline', () => {
  let userId: string;
  let templateId: string;

  beforeAll(async () => {
    const user = await createTestUser(prisma, { email: 'pipeline-user@test.com' });
    const template = await createTestTemplate(prisma, Channel.EMAIL, { name: 'pipeline-template' });
    userId = user.id;
    templateId = template.id;
  });

  it('should process a notification through the full pipeline', async () => {
    // 1. Create notification via API
    const createRes = await request(app)
      .post('/api/v1/notifications')
      .send(defaultCreateBody({ userId, templateId, channel: Channel.EMAIL }))
      .expect(202);

    const notifId = createRes.body.data.notificationId;
    expect(createRes.body.data.status).toBe('QUEUED');

    // 2. Wait for worker to process (poll DB for DELIVERED status)
    await waitFor(
      async () => {
        const notif = await prisma.notification.findUnique({ where: { id: notifId } });
        return notif?.status === NotificationStatus.DELIVERED;
      },
      { timeoutMs: 15000, description: 'notification to become DELIVERED' },
    );

    // 3. Verify final notification status via API
    const getRes = await request(app)
      .get(`/api/v1/notifications/${notifId}`)
      .expect(200);

    expect(getRes.body.data.status).toBe('DELIVERED');

    // 4. Verify timeline events via API
    const timelineRes = await request(app)
      .get(`/api/v1/notifications/${notifId}/timeline`)
      .expect(200);

    // Timeline response uses { event, timestamp, metadata } format
    const events = timelineRes.body.data;
    const eventNames = events.map((e: { event: string }) => e.event);

    expect(eventNames).toContain('NOTIFICATION_CREATED');
    expect(eventNames).toContain('REQUEST_VALIDATED');
    expect(eventNames).toContain('NOTIFICATION_STORED');
    expect(eventNames).toContain('JOB_QUEUED');
    expect(eventNames).toContain('WORKER_STARTED');
    expect(eventNames).toContain('WORKER_COMPLETED');

    // 5. Verify event ordering via API
    const workerStartedIdx = eventNames.indexOf('WORKER_STARTED');
    const workerCompletedIdx = eventNames.indexOf('WORKER_COMPLETED');
    expect(workerStartedIdx).toBeLessThan(workerCompletedIdx);

    // 6. Verify events directly in DB for status transitions
    const dbEvents = await prisma.notificationEvent.findMany({
      where: { notificationId: notifId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });

    const workerStartedEvent = dbEvents.find((e) => e.eventType === 'WORKER_STARTED');
    expect(workerStartedEvent?.statusAfter).toBe('PROCESSING');

    const workerCompletedEvent = dbEvents.find((e) => e.eventType === 'WORKER_COMPLETED');
    expect(workerCompletedEvent?.statusAfter).toBe('DELIVERED');
    expect(workerCompletedEvent?.executionId).toBeDefined();
  });

  it('should process multiple notifications concurrently', async () => {
    const ids: string[] = [];

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/v1/notifications')
        .send(defaultCreateBody({ userId, templateId, channel: Channel.EMAIL }))
        .expect(202);
      ids.push(res.body.data.notificationId);
    }

    await waitFor(
      async () => {
        const count = await prisma.notification.count({
          where: {
            id: { in: ids },
            status: NotificationStatus.DELIVERED,
          },
        });
        return count === 3;
      },
      { timeoutMs: 20000, description: 'all 3 notifications to become DELIVERED' },
    );

    for (const id of ids) {
      const notif = await prisma.notification.findUnique({ where: { id } });
      expect(notif?.status).toBe(NotificationStatus.DELIVERED);
    }
  });

  it('should have correct event status transitions', async () => {
    const createRes = await request(app)
      .post('/api/v1/notifications')
      .send(defaultCreateBody({ userId, templateId, channel: Channel.EMAIL }))
      .expect(202);

    const notifId = createRes.body.data.notificationId;

    await waitFor(
      async () => {
        const notif = await prisma.notification.findUnique({ where: { id: notifId } });
        return notif?.status === NotificationStatus.DELIVERED;
      },
      { timeoutMs: 15000, description: 'notification DELIVERED' },
    );

    const events = await prisma.notificationEvent.findMany({
      where: { notificationId: notifId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });

    for (const event of events) {
      const hasStatus = event.statusBefore !== null || event.statusAfter !== null;
      expect(hasStatus).toBe(true);
    }

    const jobQueued = events.find((e) => e.eventType === 'JOB_QUEUED');
    expect(jobQueued?.executionId).toBeDefined();
    expect(typeof jobQueued?.executionId).toBe('string');
  });
});
