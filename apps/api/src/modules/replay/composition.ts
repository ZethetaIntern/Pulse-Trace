import { notificationQueue } from '../../infrastructure/queue/notification-queue';
import { PrismaNotificationEventRepository } from '../notifications/repositories/prisma-notification-event-repository';
import { PrismaNotificationRepository } from '../notifications/repositories/prisma-notification-repository';
import { PrismaReplayExecutionRepository } from './repositories/prisma-replay-execution-repository';
import { ReplayService } from './services/replay-service';

/**
 * Shared application service for replay. Stateless; repositories and the queue
 * are singletons.
 */
export const replayService = new ReplayService(
  new PrismaNotificationRepository(),
  new PrismaNotificationEventRepository(),
  notificationQueue,
  new PrismaReplayExecutionRepository(),
);
