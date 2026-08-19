import { NotificationStatus } from '@prisma/client';
import { HttpError } from '../../../shared/errors/http-error';
import { ReplayNotificationDto } from '../dto/replay-notification.dto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Notification statuses that are NOT eligible for replay.
 * Per the documentation: "Allow developers to execute a previously processed
 * notification again." Notifications still in progress (CREATED, QUEUED,
 * PROCESSING) cannot be replayed.
 */
const NON_REPLAYABLE_STATUSES: readonly NotificationStatus[] = [
  NotificationStatus.CREATED,
  NotificationStatus.QUEUED,
  NotificationStatus.PROCESSING,
];

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Validates the :notificationId path parameter for replay endpoints.
 */
export function validateReplayNotificationId(raw: string): string {
  if (!isUuid(raw)) {
    throw new HttpError('Validation failed', 400, 'INVALID_REQUEST', [
      { field: 'notificationId', message: 'must be a valid UUID' },
    ]);
  }
  return raw;
}

/**
 * Validates the POST /api/v1/notifications/:notificationId/replay request body.
 */
export function validateReplayRequest(
  notificationId: string,
  body: unknown,
): ReplayNotificationDto {
  if (notificationId && !isUuid(notificationId)) {
    throw new HttpError('Validation failed', 400, 'INVALID_REQUEST', [
      { field: 'notificationId', message: 'must be a valid UUID' },
    ]);
  }

  if (body !== undefined && body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    if (record.reason !== undefined && record.reason !== null && typeof record.reason !== 'string') {
      throw new HttpError('Validation failed', 400, 'INVALID_REQUEST', [
        { field: 'reason', message: 'must be a string' },
      ]);
    }
  }

  const reason =
    body !== undefined &&
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body)
      ? (body as Record<string, unknown>).reason
      : undefined;

  return {
    notificationId,
    ...(reason !== undefined && reason !== null && typeof reason === 'string' && { reason }),
  };
}

/**
 * Checks whether a notification status allows replay.
 * Throws REPLAY_NOT_ALLOWED if the notification is still in progress.
 */
export function assertReplayable(status: NotificationStatus): void {
  if (NON_REPLAYABLE_STATUSES.includes(status)) {
    throw new HttpError(
      'Notification is not in a replable state',
      400,
      'REPLAY_NOT_ALLOWED',
      [{ field: 'status', message: `cannot replay a notification with status ${status}` }],
    );
  }
}
