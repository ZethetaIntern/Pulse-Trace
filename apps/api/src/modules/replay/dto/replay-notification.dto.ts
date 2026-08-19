/**
 * Validated request contract for POST /api/v1/notifications/:notificationId/replay.
 */
export interface ReplayNotificationDto {
  notificationId: string;
  reason?: string;
}
