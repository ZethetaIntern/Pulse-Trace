import pino from 'pino';
import { env } from '../../config/env';

const transport = env.nodeEnv === 'development'
  ? pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    })
  : undefined;

export const logger = transport
  ? pino({ level: env.logLevel }, transport)
  : pino({ level: env.logLevel });
