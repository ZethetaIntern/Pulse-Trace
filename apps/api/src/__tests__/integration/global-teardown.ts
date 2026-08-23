/**
 * Global teardown for integration test suites.
 * Cleans up Redis DB 1 after all tests complete.
 */
module.exports = async function globalTeardown() {
  const redisUrl = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';

  if (!redisUrl.includes('/1')) {
    console.error('[SAFETY] Skipping Redis cleanup: URL does not use DB 1');
    return;
  }

  const { default: Redis } = await import('ioredis');
  const redis = new Redis(redisUrl);

  try {
    await redis.flushdb();
    const keys = await redis.keys('bull:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    console.log('[Global Teardown] Redis DB 1 cleaned');
  } finally {
    await redis.quit();
  }
};
