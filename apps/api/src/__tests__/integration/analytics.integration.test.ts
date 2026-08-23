/**
 * Analytics integration tests.
 *
 * Tests analytics endpoints against real PostgreSQL.
 * Seeds known data and verifies aggregated results.
 * Tests the date_trunc queries that run on PostgreSQL.
 */

import request from 'supertest';
import {
  PrismaClient,
  Channel,
  Category,
  Priority,
  NotificationStatus,
  EventType,
} from '@prisma/client';
import { app } from '../../app';
import {
  getTestPrisma,
  disconnectTestPrisma,
  cleanTestDatabase,
  cleanTestRedis,
  createTestUser,
  createTestTemplate,
} from './helpers';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = getTestPrisma();
  await cleanTestRedis();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await cleanTestRedis();
  await disconnectTestPrisma();
});

describe('GET /api/v1/analytics/dashboard', () => {
  beforeAll(async () => {
    await cleanTestDatabase(prisma);

    const user = await createTestUser(prisma, { email: 'analytics-user@test.com' });
    const template = await createTestTemplate(prisma, Channel.EMAIL, { name: 'analytics-template' });

    // Seed: 10 notifications total
    // 7 DELIVERED, 2 FAILED, 1 DLQ
    const notifications = [];
    for (let i = 0; i < 10; i++) {
      const status =
        i < 7
          ? NotificationStatus.DELIVERED
          : i < 9
            ? NotificationStatus.FAILED
            : NotificationStatus.DLQ;

      const notif = await prisma.notification.create({
        data: {
          userId: user.id,
          templateId: template.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.NORMAL,
          status,
          payload: {},
          metadata: {},
        },
      });
      notifications.push(notif);
    }

    // Seed: 3 retry events
    for (let i = 0; i < 3; i++) {
      await prisma.notificationEvent.create({
        data: {
          notificationId: notifications[i].id,
          eventType: EventType.RETRY_SCHEDULED,
          statusBefore: NotificationStatus.FAILED,
          statusAfter: NotificationStatus.FAILED,
          metadata: {},
        },
      });
    }
  });

  it('should return correct total count', async () => {
    const res = await request(app).get('/api/v1/analytics/dashboard').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totalNotifications).toBe(10);
  });

  it('should return correct retry and DLQ counts', async () => {
    const res = await request(app).get('/api/v1/analytics/dashboard').expect(200);

    expect(res.body.data.retryCount).toBe(3);
    expect(res.body.data.dlqCount).toBe(1);
  });

  it('should return channel breakdown', async () => {
    const res = await request(app).get('/api/v1/analytics/dashboard').expect(200);

    expect(res.body.data.channelBreakdown).toHaveProperty('EMAIL');
    expect(res.body.data.channelBreakdown.EMAIL).toBe(10);
  });

  it('should return success and failure rates', async () => {
    const res = await request(app).get('/api/v1/analytics/dashboard').expect(200);

    // 7 delivered out of 10 = 70%
    expect(res.body.data.successRate).toBe(70);
    // (2 failed + 1 DLQ) out of 10 = 30%
    expect(res.body.data.failureRate).toBe(30);
  });
});

describe('GET /api/v1/analytics/trends', () => {
  beforeAll(async () => {
    await cleanTestDatabase(prisma);

    const user = await createTestUser(prisma, { email: 'trends-user@test.com' });
    const template = await createTestTemplate(prisma, Channel.EMAIL, { name: 'trends-template' });

    // Seed notifications with specific timestamps
    const now = new Date();
    const statuses = [
      NotificationStatus.DELIVERED,
      NotificationStatus.DELIVERED,
      NotificationStatus.FAILED,
      NotificationStatus.DELIVERED,
    ];

    for (let i = 0; i < statuses.length; i++) {
      const createdAt = new Date(now.getTime() - (statuses.length - 1 - i) * 60 * 60 * 1000);

      const notif = await prisma.notification.create({
        data: {
          userId: user.id,
          templateId: template.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.NORMAL,
          status: statuses[i],
          payload: {},
          metadata: {},
          createdAt,
        },
      });

      await prisma.notificationEvent.create({
        data: {
          notificationId: notif.id,
          eventType: EventType.NOTIFICATION_CREATED,
          statusAfter: NotificationStatus.CREATED,
          occurredAt: createdAt,
          metadata: {},
        },
      });
    }
  });

  it('should return trend response for hourly interval', async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .get(`/api/v1/analytics/trends?interval=hour&from=${from}&to=${to}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    // Response shape: { interval, from, to, buckets: [...] }
    expect(res.body.data).toHaveProperty('interval', 'hour');
    expect(res.body.data).toHaveProperty('buckets');
    expect(Array.isArray(res.body.data.buckets)).toBe(true);
    expect(res.body.data.buckets.length).toBeGreaterThan(0);

    for (const bucket of res.body.data.buckets) {
      expect(bucket).toHaveProperty('date');
      expect(bucket).toHaveProperty('created');
      expect(bucket).toHaveProperty('delivered');
      expect(bucket).toHaveProperty('failed');
      expect(bucket).toHaveProperty('retried');
      expect(typeof bucket.created).toBe('number');
    }
  });

  it('should return trend response for daily interval', async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .get(`/api/v1/analytics/trends?interval=day&from=${from}&to=${to}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('interval', 'day');
    expect(Array.isArray(res.body.data.buckets)).toBe(true);
  });

  it('should return trend response for week interval', async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .get(`/api/v1/analytics/trends?interval=week&from=${from}&to=${to}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('should return trend response for month interval', async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .get(`/api/v1/analytics/trends?interval=month&from=${from}&to=${to}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('should return 400 for invalid interval', async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .get(`/api/v1/analytics/trends?interval=invalid&from=${from}&to=${to}`)
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('should use defaults when parameters are missing', async () => {
    // The validator provides sensible defaults for missing from/to/interval
    const res = await request(app).get('/api/v1/analytics/trends').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('buckets');
  });
});

describe('GET /api/v1/analytics/channels', () => {
  beforeAll(async () => {
    await cleanTestDatabase(prisma);

    const user = await createTestUser(prisma, { email: 'channels-user@test.com' });

    const emailTemplate = await createTestTemplate(prisma, Channel.EMAIL, {
      name: 'channels-email-template',
    });
    const smsTemplate = await createTestTemplate(prisma, Channel.SMS, {
      name: 'channels-sms-template',
    });

    // 6 EMAIL: 5 DELIVERED, 1 FAILED
    for (let i = 0; i < 6; i++) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          templateId: emailTemplate.id,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.NORMAL,
          status: i < 5 ? NotificationStatus.DELIVERED : NotificationStatus.FAILED,
          payload: {},
          metadata: {},
        },
      });
    }

    // 4 SMS: 4 DELIVERED
    for (let i = 0; i < 4; i++) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          templateId: smsTemplate.id,
          channel: Channel.SMS,
          category: Category.TRANSACTIONAL,
          priority: Priority.NORMAL,
          status: NotificationStatus.DELIVERED,
          payload: {},
          metadata: {},
        },
      });
    }
  });

  it('should return per-channel statistics', async () => {
    const res = await request(app).get('/api/v1/analytics/channels').expect(200);

    expect(res.body.success).toBe(true);
    // Response shape: { channels: [...] }
    expect(res.body.data).toHaveProperty('channels');
    expect(Array.isArray(res.body.data.channels)).toBe(true);

    const channels = res.body.data.channels;
    const emailChannel = channels.find((c: { channel: string }) => c.channel === 'EMAIL');
    const smsChannel = channels.find((c: { channel: string }) => c.channel === 'SMS');

    expect(emailChannel).toBeDefined();
    expect(emailChannel.total).toBe(6);
    expect(emailChannel.delivered).toBe(5);
    expect(emailChannel.failed).toBe(1);

    expect(smsChannel).toBeDefined();
    expect(smsChannel.total).toBe(4);
    expect(smsChannel.delivered).toBe(4);
    expect(smsChannel.failed).toBe(0);
  });
});
