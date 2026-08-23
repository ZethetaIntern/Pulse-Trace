/**
 * Integration test environment setup.
 *
 * Runs as a Jest setupFile BEFORE any test module imports.
 * Sets DATABASE_URL and REDIS_URL to test-specific values.
 *
 * SAFETY: Verifies URLs contain pulsetrace_test / DB 1 to prevent
 * accidentally running integration tests against the dev database.
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://pulsetrace:pulsetrace@localhost:5432/pulsetrace_test';

const TEST_REDIS_URL =
  process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';

// --- Safety: fail fast if URLs don't look right ---

if (!TEST_DATABASE_URL.includes('pulsetrace_test')) {
  throw new Error(
    `[INTEGRATION TEST SAFETY] DATABASE_URL does not contain "pulsetrace_test": ${TEST_DATABASE_URL}\n` +
      'Integration tests must NEVER run against the development database.\n' +
      'Set TEST_DATABASE_URL to a URL containing pulsetrace_test.',
  );
}

if (!TEST_REDIS_URL.includes('/1')) {
  throw new Error(
    `[INTEGRATION TEST SAFETY] REDIS_URL does not use DB 1: ${TEST_REDIS_URL}\n` +
      'Integration tests must use Redis DB 1, never DB 0.\n' +
      'Set TEST_REDIS_URL to a URL ending with /1.',
  );
}

// Set environment variables BEFORE any module imports.
// These take precedence over dotenv.config() because dotenv
// does not overwrite existing process.env values.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.REDIS_URL = TEST_REDIS_URL;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.PORT = '0'; // Don't bind to a fixed port
process.env.QUEUE_ATTEMPTS = '2'; // Faster retries for tests
process.env.QUEUE_BACKOFF_MS = '100'; // Short backoff for tests
