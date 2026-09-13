import { EventType, Notification, NotificationStatus, Prisma, Template, User } from '@prisma/client';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { ListNotificationsQuery } from '../dto/list-notifications-query';

export interface PaginatedNotifications {
  items: Notification[];
  total: number;
}

export interface CreateNotificationTransactionalInput {
  dto: CreateNotificationDto;
  initialStatus?: NotificationStatus;
  events?: Array<{
    eventType: EventType;
    statusBefore?: NotificationStatus | null;
    statusAfter?: NotificationStatus | null;
    metadata?: Prisma.InputJsonValue;
  }>;
  outbox?: {
    topic: string;
    partitionKey: string;
    payload: Record<string, unknown>;
  };
}

/**
 * Data-access contract for the notification module.
 *
 * The referenced-record lookups (findUserById / findTemplateById) exist here
 * because User and Template modules do not exist yet; they will move to their
 * own repositories when those modules are introduced.
 */
export interface NotificationRepository {
  createNotification(dto: CreateNotificationDto): Promise<Notification>;
  createNotificationTransactional?(input: CreateNotificationTransactionalInput): Promise<Notification>;
  findNotificationById(id: string): Promise<Notification | null>;
  updateNotificationStatus(id: string, status: NotificationStatus): Promise<Notification | null>;
  listNotifications(query: ListNotificationsQuery): Promise<PaginatedNotifications>;
  findUserById(id: string): Promise<User | null>;
  findTemplateById(id: string): Promise<Template | null>;
}
