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

  return {
    port,
    nodeEnv,
    databaseUrl,
    redisUrl,
    logLevel,
    queueAttempts,
    queueBackoffMs,
  };
}

export const env = loadEnvironment();
