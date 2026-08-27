/**
 * Notification API integration tests.
 *
 * Tests the real HTTP endpoints against real PostgreSQL and Redis.
 * Uses Supertest to make requests against the Express app without starting a port.
 *
 * WARNING: These tests operate on pulsetrace_test database ONLY.
 */

import request from 'supertest';
import { PrismaClient, Channel } from '@prisma/client';
import { app } from '../../app';
import {
  getTestPrisma,
  disconnectTestPrisma,
  cleanTestDatabase,
  cleanTestRedis,
  createTestUser,
  createTestTemplate,
  defaultCreateBody,
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

describe('POST /api/v1/notifications', () => {
  let userId: string;
  let templateId: string;

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
    const user = await createTestUser(prisma);
    const template = await createTestTemplate(prisma, Channel.EMAIL);
    userId = user.id;
    templateId = template.id;
  });

  it('should create a notification with valid data', async () => {
    const res = await request(app)
      .post('/api/v1/notifications')
      .send(defaultCreateBody({ userId, templateId, channel: Channel.EMAIL }))
      .expect(202);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('notificationId');
    expect(res.body.data.status).toBe('QUEUED');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('should return 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/notifications')
      .send({})
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('should return 400 for invalid channel', async () => {
    const res = await request(app)
      .post('/api/v1/notifications')
      .send({
        userId,
        templateId,
        channel: 'INVALID_CHANNEL',
        category: 'TRANSACTIONAL',
        priority: 'NORMAL',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('should return 400 for nonexistent user', async () => {
    const res = await request(app)
      .post('/api/v1/notifications')
      .send(
        defaultCreateBody({
          userId: '00000000-0000-0000-0000-000000000000',
          templateId,
          channel: Channel.EMAIL,
        }),
      )
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('should return 400 for nonexistent template', async () => {
    const res = await request(app)
      .post('/api/v1/notifications')
      .send(
        defaultCreateBody({
          userId,
          templateId: '00000000-0000-0000-0000-000000000000',
          channel: Channel.EMAIL,
        }),
      )
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TEMPLATE_NOT_FOUND');
  });

  it('should return 400 for channel/template mismatch', async () => {
    const smsTemplate = await createTestTemplate(prisma, Channel.SMS);

    const res = await request(app)
      .post('/api/v1/notifications')
      .send(
        defaultCreateBody({
          userId,
          templateId: smsTemplate.id,
          channel: Channel.EMAIL,
        }),
      )
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TEMPLATE_CHANNEL_MISMATCH');
  });

  it('should return 400 for invalid category', async () => {
    const res = await request(app)
      .post('/api/v1/notifications')
      .send({
        userId,
        templateId,
        channel: Channel.EMAIL,
        category: 'INVALID_CATEGORY',
        priority: 'NORMAL',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('should return 400 for invalid priority', async () => {
    const res = await request(app)
      .post('/api/v1/notifications')
      .send({
        userId,
        templateId,
        channel: Channel.EMAIL,
        category: 'TRANSACTIONAL',
        priority: 'INVALID_PRIORITY',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/notifications/:notificationId', () => {
  let userId: string;
  let templateId: string;

  beforeAll(async () => {
    const user = await createTestUser(prisma, { email: 'get-notif-test@test.com' });
    const template = await createTestTemplate(prisma, Channel.EMAIL, { name: 'get-notif-template' });
    userId = user.id;
    templateId = template.id;
  });

  it('should get an existing notification', async () => {
    // Create one first
    const createRes = await request(app)
      .post('/api/v1/notifications')
      .send(defaultCreateBody({ userId, templateId, channel: Channel.EMAIL }))
      .expect(202);

    const notifId = createRes.body.data.notificationId;

    // Get it
    const res = await request(app)
      .get(`/api/v1/notifications/${notifId}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(notifId);
    expect(res.body.data.channel).toBe('EMAIL');
    expect(res.body.data.status).toBe('QUEUED');
  });

  it('should return 404 for nonexistent notification', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/00000000-0000-0000-0000-000000000000')
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('should return 400 for invalid UUID', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/not-a-uuid')
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/notifications', () => {
  let userId: string;
  let templateId: string;

  beforeAll(async () => {
    const user = await createTestUser(prisma, { email: 'list-notif-test@test.com' });
    const template = await createTestTemplate(prisma, Channel.EMAIL, { name: 'list-notif-template' });
    userId = user.id;
    templateId = template.id;

    // Create multiple notifications
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/notifications')
        .send(defaultCreateBody({ userId, templateId, channel: Channel.EMAIL }));
    }
  });

  it('should list notifications with pagination', async () => {
    const res = await request(app)
      .get('/api/v1/notifications?page=1&limit=3')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(3);
    expect(res.body.data.pagination).toHaveProperty('total');
    expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(5);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.limit).toBe(3);
  });

  it('should filter by channel', async () => {
    const res = await request(app)
      .get('/api/v1/notifications?channel=EMAIL')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(5);
    for (const item of res.body.data.items) {
      expect(item.channel).toBe('EMAIL');
    }
  });

  it('should filter by status', async () => {
    const res = await request(app)
      .get('/api/v1/notifications?status=QUEUED')
      .expect(200);

    expect(res.body.success).toBe(true);
    for (const item of res.body.data.items) {
      expect(item.status).toBe('QUEUED');
    }
  });

  it('should sort by createdAt desc', async () => {
    const res = await request(app)
      .get('/api/v1/notifications?sort=createdAt&order=desc')
      .expect(200);

    expect(res.body.success).toBe(true);
    const items = res.body.data.items;
    if (items.length >= 2) {
      const dates = items.map((i: { createdAt: string }) => new Date(i.createdAt).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
      }
    }
  });
});

describe('GET /api/v1/notifications/:notificationId/timeline', () => {
  let userId: string;
  let templateId: string;

  beforeAll(async () => {
    const user = await createTestUser(prisma, { email: 'timeline-test@test.com' });
    const template = await createTestTemplate(prisma, Channel.EMAIL, { name: 'timeline-template' });
    userId = user.id;
    templateId = template.id;
  });

  it('should return timeline for an existing notification', async () => {
    const createRes = await request(app)
      .post('/api/v1/notifications')
      .send(defaultCreateBody({ userId, templateId, channel: Channel.EMAIL }))
      .expect(202);

    const notifId = createRes.body.data.notificationId;

    const res = await request(app)
      .get(`/api/v1/notifications/${notifId}/timeline`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Should have at least NOTIFICATION_CREATED, REQUEST_VALIDATED, NOTIFICATION_STORED
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);

    // Events should be in chronological order (field is 'timestamp' in response)
    const timestamps = res.body.data.map((e: { timestamp: string }) =>
      new Date(e.timestamp).getTime(),
    );
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });

  it('should return 404 for nonexistent notification timeline', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/00000000-0000-0000-0000-000000000000/timeline')
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /health', () => {
  it('should return health status', async () => {
    const res = await request(app).get('/health').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body.version).toBe('1.0.0');
  });

  it('should return X-Request-ID header', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(typeof res.headers['x-request-id']).toBe('string');
    expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('should preserve supplied X-Request-ID', async () => {
    const customId = 'my-e2e-correlation-id';
    const res = await request(app)
      .get('/health')
      .set('X-Request-ID', customId)
      .expect(200);

    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('should return X-Request-ID on 404', async () => {
    const res = await request(app).get('/nonexistent').expect(404);
    expect(res.headers['x-request-id']).toBeDefined();
  });
});
