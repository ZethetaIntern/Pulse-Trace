import { ReplayExecution, NotificationStatus, ReplayStatus } from '@prisma/client';

/**
 * Response contract for POST /notifications/:notificationId/replay (202 Accepted).
 */
export interface ReplayNotificationResponse {
  replayId: string;
  originalNotificationId: string;
  notificationId: string;
  status: ReplayStatus;
}

/**
 * Response contract for a single replay execution entry.
 */
export interface ReplayExecutionResponse {
  replayId: string;
  originalNotificationId: string;
  newNotificationId: string | null;
  status: ReplayStatus;
  reason: string | null;
  triggeredBy: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
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
    status: execution.status,
    reason: execution.reason,
    triggeredBy: execution.triggeredBy,
    errorMessage: execution.errorMessage,
    createdAt: execution.createdAt.toISOString(),
    startedAt: execution.startedAt ? execution.startedAt.toISOString() : null,
    completedAt: execution.completedAt ? execution.completedAt.toISOString() : null,
    ...(newNotificationStatus !== undefined && {
      newNotificationStatus,
    }),
  };
}
