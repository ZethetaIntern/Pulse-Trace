import path from 'path';
import dotenv from 'dotenv';

// Load the monorepo root .env as the single source of truth.
// apps/api/.env is intentionally not used: it caused a duplicate
// environment-variable conflict with the root .env.
// Resolving from __dirname works in both dev (src/config via tsx) and
// production (dist/config via node), since both are 3 levels below the root.
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });

interface Environment {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  redisUrl: string;
  logLevel: string;
}

function loadEnvironment(): Environment {
  const port = parseInt(process.env.PORT || '4000', 10);
  const nodeEnv = process.env.NODE_ENV || 'development';
  const databaseUrl = process.env.DATABASE_URL || '';
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const logLevel = process.env.LOG_LEVEL || 'info';

  return {
    port,
    nodeEnv,
    databaseUrl,
    redisUrl,
    logLevel,
  };
}

export const env = loadEnvironment();
