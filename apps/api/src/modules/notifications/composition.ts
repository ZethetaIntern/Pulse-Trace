import { notificationQueue } from '../../infrastructure/queue/notification-queue';
import { PrismaNotificationEventRepository } from './repositories/prisma-notification-event-repository';
import { PrismaNotificationRepository } from './repositories/prisma-notification-repository';
import { NotificationService } from './services/notification-service';

/**
 * Shared application service used by both the HTTP layer (routes) and the
 * background worker. Stateless; repositories and the queue are singletons.
 */
export const notificationService = new NotificationService(
  new PrismaNotificationRepository(),
  new PrismaNotificationEventRepository(),
  notificationQueue,
);