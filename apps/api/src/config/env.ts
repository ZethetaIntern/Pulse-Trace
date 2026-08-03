import dotenv from 'dotenv';

dotenv.config();

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
