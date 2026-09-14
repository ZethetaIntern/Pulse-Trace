import { NotificationStatus } from '@prisma/client';
import { HttpError } from '../../../shared/errors/http-error';
import { ReplayNotificationDto } from '../dto/replay-notification.dto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (record.operatorId !== undefined && record.operatorId !== null && typeof record.operatorId !== 'string') {
      throw new HttpError('Validation failed', 400, 'INVALID_REQUEST', [
        { field: 'operatorId', message: 'must be a string' },
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

  const operatorId =
    body !== undefined &&
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body)
      ? (body as Record<string, unknown>).operatorId
      : undefined;

  return {
    notificationId,
    ...(reason !== undefined && reason !== null && typeof reason === 'string' && { reason }),
    ...(operatorId !== undefined && operatorId !== null && typeof operatorId === 'string' && { operatorId }),
  };
}

/**
 * Checks whether a notification status allows replay.
 * In Phase 20 (DLQ & Operator Replay), replay is restricted specifically to
 * notifications in the Dead-Letter Queue (DLQ).
 */
export function assertReplayable(status: NotificationStatus, hasDeadLetter?: boolean): void {
  if (status !== NotificationStatus.DLQ || (hasDeadLetter !== undefined && !hasDeadLetter)) {
    throw new HttpError(
      'Notification is not eligible for replay. Only notifications in Dead-Letter Queue (DLQ) can be replayed',
      400,
      'REPLAY_NOT_ALLOWED',
      [{ field: 'status', message: `cannot replay a notification with status ${status}; must be DLQ` }],
    );
  }
}
