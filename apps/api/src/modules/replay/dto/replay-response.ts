import { ReplayExecution, NotificationStatus } from '@prisma/client';

/**
 * Response contract for POST /notifications/:notificationId/replay (202 Accepted).
 */
export interface ReplayNotificationResponse {
  replayId: string;
  notificationId: string;
}

/**
 * Response contract for a single replay execution entry.
 */
export interface ReplayExecutionResponse {
  replayId: string;
  originalNotificationId: string;
  newNotificationId: string | null;
  reason: string | null;
  triggeredBy: string | null;
  createdAt: string;
  newNotificationStatus?: string;
}

/**
 * Maps a ReplayExecution record to the API response shape.
 */
export function toReplayExecutionResponse(
  execution: ReplayExecution,
  newNotificationStatus?: NotificationStatus,
): ReplayExecutionResponse {
  return {
    replayId: execution.id,
    originalNotificationId: execution.originalNotificationId,
    newNotificationId: execution.newNotificationId,
    reason: execution.reason,
    triggeredBy: execution.triggeredBy,
    createdAt: execution.createdAt.toISOString(),
    ...(newNotificationStatus !== undefined && {
      newNotificationStatus,
    }),
  };
}
