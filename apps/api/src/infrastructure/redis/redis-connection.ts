import Redis, { RedisOptions } from 'ioredis';
import { env } from '../../config/env';

export function createRedisClient(options: RedisOptions = {}): Redis {
  return new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    ...options,
  });
}
