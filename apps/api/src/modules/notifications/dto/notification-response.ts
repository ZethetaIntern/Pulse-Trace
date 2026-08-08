import { Notification } from '@prisma/client';

/**
 * Response contract for a notification, isolating the API surface from the
 * Prisma model (e.g. Date objects serialized to ISO strings).
 */
export interface NotificationResponse {
  id: string;
  userId: string;
  templateId: string;
  channel: string;
  category: string;
  priority: string;
  status: string;
  payload: unknown;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export function toNotificationResponse(notification: Notification): NotificationResponse {
  return {
    id: notification.id,
    userId: notification.userId,
    templateId: notification.templateId,
    channel: notification.channel,
    category: notification.category,
    priority: notification.priority,
    status: notification.status,
    payload: notification.payload,
    metadata: notification.metadata,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
  };
}

/**
 * Response contract for POST /notifications (202 Accepted).
 * Matches the asynchronous API contract in api-specification.md: the request
 * is accepted for processing and only the id + acceptance status are returned.
 */
export interface CreateNotificationResponse {
  notificationId: string;
  status: string;
}

export function toCreateNotificationResponse(
  notification: Notification,
): CreateNotificationResponse {
  return {
    notificationId: notification.id,
    status: notification.status,
  };
}

export interface PaginatedNotificationsResponse {
  items: NotificationResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
