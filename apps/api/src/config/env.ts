import path from 'path';
import dotenv from 'dotenv';

// Load the monorepo root .env as the single source of truth.
// apps/api/.env is intentionally not used: it caused a duplicate
// environment-variable conflict with the root .env.
// Resolving from __dirname works in both dev (src/config via tsx) and
// production (dist/config via node), since both are 4 levels below the root.
dotenv.config({ path: path.resolve(__dirname, '../../../..', '.env') });

interface Environment {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  redisUrl: string;
  logLevel: string;
  queueAttempts: number;
  queueBackoffMs: number;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMax: number;
  analyticsMaxRangeDays: number;
}

function loadEnvironment(): Environment {
  const port = parseInt(process.env.PORT || '4000', 10);
  const nodeEnv = process.env.NODE_ENV || 'development';
  const databaseUrl = process.env.DATABASE_URL || '';
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const logLevel = process.env.LOG_LEVEL || 'info';
  // BullMQ retry policy for notification jobs (roadmap Phase 3: "Retry
  // configuration"). Configurable via env, with sensible development defaults.
  const queueAttempts = parseInt(process.env.QUEUE_ATTEMPTS || '3', 10);
  const queueBackoffMs = parseInt(process.env.QUEUE_BACKOFF_MS || '1000', 10);

  // CORS origins: comma-separated list. In development, defaults to '*' if not set.
  // In production, must be explicitly configured.
  const corsOriginsRaw = process.env.CORS_ORIGINS || '';
  const corsOrigins = corsOriginsRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Rate limiting: configurable per-window request cap.
  // Dev defaults are generous enough not to interfere with tests.
  const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);

  // Analytics: maximum allowed date range in days to prevent expensive queries.
  const analyticsMaxRangeDays = parseInt(process.env.ANALYTICS_MAX_RANGE_DAYS || '365', 10);

  return {
    port,
    nodeEnv,
    databaseUrl,
    redisUrl,
    logLevel,
    queueAttempts,
    queueBackoffMs,
    corsOrigins,
    rateLimitWindowMs,
    rateLimitMax,
    analyticsMaxRangeDays,
  };
}

export const env = loadEnvironment();
