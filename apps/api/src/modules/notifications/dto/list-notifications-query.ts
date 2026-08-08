import { Category, Channel, NotificationStatus, Priority } from '@prisma/client';

export type NotificationSortField = 'createdAt' | 'status' | 'priority' | 'channel';
export type SortOrder = 'asc' | 'desc';

/**
 * Validated query contract for GET /api/v1/notifications.
 * Matches the pagination / filtering / sorting surface documented in the
 * API specification (search is delegated to the dedicated /search endpoint).
 */
export interface ListNotificationsQuery {
  page: number;
  limit: number;
  status?: NotificationStatus;
  channel?: Channel;
  category?: Category;
  priority?: Priority;
  userId?: string;
  sort: NotificationSortField;
  order: SortOrder;
}
