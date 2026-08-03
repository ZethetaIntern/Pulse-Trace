import { ConnectionOptions } from 'bullmq';
import { env } from '../../config/env';

export const connection: ConnectionOptions = {
  url: env.redisUrl,
};
