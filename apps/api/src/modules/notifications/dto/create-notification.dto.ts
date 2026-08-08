import { Category, Channel, Priority } from '@prisma/client';

/**
 * Validated request contract for POST /api/v1/notifications.
 *
 * The API specification exposes `variables`; the Notification model persists
 * them in the `payload` JSONB column, so `variables` is mapped to `payload`
 * by the repository.
 */
export interface CreateNotificationDto {
  userId: string;
  templateId: string;
  channel: Channel;
  category: Category;
  priority: Priority;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
