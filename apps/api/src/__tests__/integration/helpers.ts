/**
 * Shared helpers for integration tests.
 *
 * Provides:
 * - Seed data factories for test users, templates, and notifications
 * - Database cleanup utilities (test DB only)
 * - Redis cleanup utilities (DB 1 only)
 * - Polling helper for waiting on async worker processing
 * - Safety checks to prevent touching the dev database
 */

import { PrismaClient, Channel, Category, Priority } from '@prisma/client';

// ------------------------------------------------------------------
// Safety guardrails
// ------------------------------------------------------------------

function assertTestDatabase(_prisma: PrismaClient): void {
  // The Prisma client's internal datasource URL is not directly accessible,
  // but we can check our env var which was set in setup-env.ts.
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.includes('pulsetrace_test')) {
    throw new Error(
      '[SAFETY] Refusing to clean: DATABASE_URL does not contain "pulsetrace_test". ' +
        `Current: ${dbUrl}`,
    );
  }
}

function assertTestRedis(): void {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || !redisUrl.includes('/1')) {
    throw new Error(
      '[SAFETY] Refusing to clean Redis: REDIS_URL does not use DB 1. ' +
        `Current: ${redisUrl}`,
    );
  }
}

// ------------------------------------------------------------------
// Prisma client for tests (uses env vars set in setup-env.ts)
// ------------------------------------------------------------------

let _prisma: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}

// ------------------------------------------------------------------
// Seed factories
// ------------------------------------------------------------------

let userCounter = 0;
let templateCounter = 0;

export interface TestUser {
  id: string;
  email: string;
  name: string;
}

export interface TestTemplate {
  id: string;
  name: string;
  channel: Channel;
}

export async function createTestUser(
  prisma: PrismaClient,
  overrides?: { email?: string; name?: string },
): Promise<TestUser> {
  userCounter++;
  const email = overrides?.email || `integration-test-user-${userCounter}@test.example.com`;
  const name = overrides?.name || `Integration Test User ${userCounter}`;

  const user = await prisma.user.create({
    data: { email, name },
  });

  return { id: user.id, email: user.email ?? email, name: user.name || name };
}

export async function createTestTemplate(
  prisma: PrismaClient,
  channel: Channel = Channel.EMAIL,
  overrides?: { name?: string },
): Promise<TestTemplate> {
  templateCounter++;
  const name = overrides?.name || `integration-test-template-${templateCounter}`;

  const template = await prisma.template.create({
    data: {
      name,
      channel,
      subject: channel === Channel.EMAIL ? 'Test Subject' : undefined,
      body: 'Hello {{name}}, this is a test notification.',
      version: 1,
      status: 'PUBLISHED',
    },
  });

  return { id: template.id, name: template.name, channel: template.channel };
}

export interface TestNotificationData {
  userId: string;
  templateId: string;
  channel: Channel;
  category?: Category;
  priority?: Priority;
  variables?: Record<string, unknown>;
}

export function defaultCreateBody(data: TestNotificationData) {
  return {
    userId: data.userId,
    templateId: data.templateId,
    channel: data.channel,
    category: data.category || Category.TRANSACTIONAL,
    priority: data.priority || Priority.NORMAL,
    variables: data.variables || { name: 'Test User' },
  };
}

// ------------------------------------------------------------------
// Database cleanup
// ------------------------------------------------------------------

/**
 * Truncate all test data from the database.
 * Only works with pulsetrace_test database.
 */
export async function cleanTestDatabase(prisma: PrismaClient): Promise<void> {
  assertTestDatabase(prisma);

  // Delete in dependency order (foreign key constraints)
  await prisma.notificationEvent.deleteMany();
  await prisma.replayExecution.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.template.deleteMany();
  await prisma.user.deleteMany();
}

// ------------------------------------------------------------------
// Redis cleanup
// ------------------------------------------------------------------

/**
 * Flush Redis DB 1 using ioredis.
 * Only works with Redis DB 1.
 */
export async function cleanTestRedis(): Promise<void> {
  assertTestRedis();

  const { default: Redis } = await import('ioredis');
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1');

  try {
    await redis.flushdb();
    // Also clean BullMQ keys
    const keys = await redis.keys('bull:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } finally {
    await redis.quit();
  }
}

// ------------------------------------------------------------------
// Polling helper
// ------------------------------------------------------------------

/**
 * Poll a condition function until it returns true or timeout is reached.
 * Uses exponential backoff between attempts.
 */
export async function waitFor(
  conditionFn: () => Promise<boolean>,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    description?: string;
  } = {},
): Promise<void> {
  const { timeoutMs = 15000, intervalMs = 100, description = 'condition' } = options;
  const startTime = Date.now();
  let interval = intervalMs;

  while (Date.now() - startTime < timeoutMs) {
    if (await conditionFn()) {
      return;
    }
    await sleep(Math.min(interval, 500));
    interval = Math.min(interval * 1.5, 500);
  }

  throw new Error(
    `Timeout waiting for ${description} after ${timeoutMs}ms`,
  );
}

/**
 * Simple sleep utility.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ------------------------------------------------------------------
// Counters reset (call between suites if needed)
// ------------------------------------------------------------------

export function resetCounters(): void {
  userCounter = 0;
  templateCounter = 0;
}
