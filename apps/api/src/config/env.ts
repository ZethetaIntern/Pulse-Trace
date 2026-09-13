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
  kafkaBrokers: string[];
  kafkaClientId: string;
  kafkaConsumerGroupId: string;
  kafkaConsumerConcurrency: number;
  notificationProcessingMode: 'bullmq' | 'kafka';
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  retryMaxAttempts: number;
  retryJitterFactor: number;
  kafkaRetryConsumerGroupId: string;
  kafkaRetryConsumerConcurrency: number;
  retrySchedulerPollIntervalMs: number;
  retrySchedulerBatchSize: number;
  retrySchedulerLeaseTtlMs: number;
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
  // In production, must be explicitly configured. Trailing slashes are stripped
  // so `https://example.com/` matches the browser-sent `https://example.com`.
  const corsOriginsRaw = process.env.CORS_ORIGINS || '';
  const corsOrigins = corsOriginsRaw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => s.length > 0);

  // Rate limiting: configurable per-window request cap.
  // Dev defaults are generous enough not to interfere with tests.
  const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);

  // Analytics: maximum allowed date range in days to prevent expensive queries.
  const analyticsMaxRangeDays = parseInt(process.env.ANALYTICS_MAX_RANGE_DAYS || '365', 10);

  // Kafka configuration
  const kafkaBrokersRaw = process.env.KAFKA_BROKERS || 'localhost:9092';
  const kafkaBrokers = kafkaBrokersRaw
    .split(',')
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  const kafkaClientId = process.env.KAFKA_CLIENT_ID || 'pulsetrace-api';
  const kafkaConsumerGroupId = process.env.KAFKA_CONSUMER_GROUP_ID || 'pulsetrace-notification-consumers';
  const kafkaConsumerConcurrency = parseInt(process.env.KAFKA_CONSUMER_CONCURRENCY || '1', 10);

  // Processing mode: 'bullmq' (default) or 'kafka'
  const modeRaw = (process.env.NOTIFICATION_PROCESSING_MODE || 'bullmq').toLowerCase();
  const notificationProcessingMode: 'bullmq' | 'kafka' = modeRaw === 'kafka' ? 'kafka' : 'bullmq';

  // Retry Engine & DLQ Configuration
  const retryBaseDelayMs = parseInt(process.env.RETRY_BASE_DELAY_MS || '1000', 10);
  const retryMaxDelayMs = parseInt(process.env.RETRY_MAX_DELAY_MS || '300000', 10);
  const retryMaxAttempts = parseInt(process.env.RETRY_MAX_ATTEMPTS || '5', 10);
  const retryJitterFactor = parseFloat(process.env.RETRY_JITTER_FACTOR || '1.0');
  const kafkaRetryConsumerGroupId =
    process.env.KAFKA_RETRY_CONSUMER_GROUP_ID || 'pulsetrace-notification-retry-consumers';
  const kafkaRetryConsumerConcurrency = parseInt(process.env.KAFKA_RETRY_CONSUMER_CONCURRENCY || '1', 10);
  const retrySchedulerPollIntervalMs = parseInt(process.env.RETRY_SCHEDULER_POLL_INTERVAL_MS || '500', 10);
  const retrySchedulerBatchSize = parseInt(process.env.RETRY_SCHEDULER_BATCH_SIZE || '50', 10);
  const retrySchedulerLeaseTtlMs = parseInt(process.env.RETRY_SCHEDULER_LEASE_TTL_MS || '30000', 10);

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
    kafkaBrokers,
    kafkaClientId,
    kafkaConsumerGroupId,
    kafkaConsumerConcurrency,
    notificationProcessingMode,
    retryBaseDelayMs,
    retryMaxDelayMs,
    retryMaxAttempts,
    retryJitterFactor,
    kafkaRetryConsumerGroupId,
    kafkaRetryConsumerConcurrency,
    retrySchedulerPollIntervalMs,
    retrySchedulerBatchSize,
    retrySchedulerLeaseTtlMs,
  };
}

export const env = loadEnvironment();


