import { NotificationStatus } from '@prisma/client';
import { HttpError } from '../../../../shared/errors/http-error';
import {
  validateReplayNotificationId,
  validateReplayRequest,
  assertReplayable,
} from '../../../../modules/replay/validators/replay-validator';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const INVALID_UUID = 'not-a-uuid';

describe('validateReplayNotificationId', () => {
  it('accepts a valid UUID', () => {
    expect(validateReplayNotificationId(VALID_UUID)).toBe(VALID_UUID);
  });

  it('rejects an invalid UUID', () => {
    expect(() => validateReplayNotificationId(INVALID_UUID)).toThrow(HttpError);
  });

  it('throws with INVALID_REQUEST code', () => {
    try {
      validateReplayNotificationId(INVALID_UUID);
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe('INVALID_REQUEST');
      expect((error as HttpError).statusCode).toBe(400);
    }
  });
});

describe('validateReplayRequest', () => {
  it('returns DTO with valid UUID and no body', () => {
    const result = validateReplayRequest(VALID_UUID, undefined);
    expect(result.notificationId).toBe(VALID_UUID);
    expect(result.reason).toBeUndefined();
  });

  it('returns DTO with valid UUID and empty body', () => {
    const result = validateReplayRequest(VALID_UUID, {});
    expect(result.notificationId).toBe(VALID_UUID);
    expect(result.reason).toBeUndefined();
  });

  it('extracts reason from body', () => {
    const result = validateReplayRequest(VALID_UUID, { reason: 'Provider recovered' });
    expect(result.notificationId).toBe(VALID_UUID);
    expect(result.reason).toBe('Provider recovered');
  });

  it('rejects invalid notificationId', () => {
    expect(() => validateReplayRequest(INVALID_UUID, {})).toThrow(HttpError);
  });

  it('rejects non-string reason', () => {
    expect(() => validateReplayRequest(VALID_UUID, { reason: 123 })).toThrow(HttpError);
  });

  it('handles null body', () => {
    const result = validateReplayRequest(VALID_UUID, null);
    expect(result.notificationId).toBe(VALID_UUID);
    expect(result.reason).toBeUndefined();
  });

  it('handles array body (non-object)', () => {
    const result = validateReplayRequest(VALID_UUID, [1, 2, 3]);
    expect(result.notificationId).toBe(VALID_UUID);
    expect(result.reason).toBeUndefined();
  });
});

describe('assertReplayable', () => {
  it('allows DELIVERED status', () => {
    expect(() => assertReplayable(NotificationStatus.DELIVERED)).not.toThrow();
  });

  it('allows FAILED status', () => {
    expect(() => assertReplayable(NotificationStatus.FAILED)).not.toThrow();
  });

  it('allows RETRY_PENDING status', () => {
    expect(() => assertReplayable(NotificationStatus.RETRY_PENDING)).not.toThrow();
  });

  it('allows DLQ status', () => {
    expect(() => assertReplayable(NotificationStatus.DLQ)).not.toThrow();
  });

  it('allows SKIPPED status', () => {
    expect(() => assertReplayable(NotificationStatus.SKIPPED)).not.toThrow();
  });

  it('rejects CREATED status', () => {
    expect(() => assertReplayable(NotificationStatus.CREATED)).toThrow(HttpError);
  });

  it('rejects QUEUED status', () => {
    expect(() => assertReplayable(NotificationStatus.QUEUED)).toThrow(HttpError);
  });

  it('rejects PROCESSING status', () => {
    expect(() => assertReplayable(NotificationStatus.PROCESSING)).toThrow(HttpError);
  });

  it('throws REPLAY_NOT_ALLOWED for non-replayable statuses', () => {
    try {
      assertReplayable(NotificationStatus.PROCESSING);
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe('REPLAY_NOT_ALLOWED');
      expect((error as HttpError).statusCode).toBe(400);
    }
  });
});
