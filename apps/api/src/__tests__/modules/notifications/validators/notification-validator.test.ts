import { Category, Channel, Priority } from '@prisma/client';
import { HttpError } from '../../../../shared/errors/http-error';
import {
  validateCreateNotification,
  validateNotificationId,
  validateListNotificationsQuery,
} from '../../../../modules/notifications/validators/notification-validator';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const INVALID_UUID = 'not-a-uuid';

function validBody() {
  return {
    userId: VALID_UUID,
    templateId: VALID_UUID,
    channel: Channel.EMAIL,
    category: Category.TRANSACTIONAL,
  };
}

describe('validateCreateNotification', () => {
  it('accepts a valid create notification request', () => {
    const result = validateCreateNotification(validBody());
    expect(result.userId).toBe(VALID_UUID);
    expect(result.templateId).toBe(VALID_UUID);
    expect(result.channel).toBe(Channel.EMAIL);
    expect(result.category).toBe(Category.TRANSACTIONAL);
    expect(result.priority).toBe(Priority.NORMAL);
  });

  it('accepts optional fields (priority, variables, metadata)', () => {
    const result = validateCreateNotification({
      ...validBody(),
      priority: Priority.HIGH,
      variables: { name: 'Alice', count: 42 },
      metadata: { source: 'test' },
    });
    expect(result.priority).toBe(Priority.HIGH);
    expect(result.variables).toEqual({ name: 'Alice', count: 42 });
    expect(result.metadata).toEqual({ source: 'test' });
  });

  it('defaults priority to NORMAL when omitted', () => {
    const result = validateCreateNotification(validBody());
    expect(result.priority).toBe(Priority.NORMAL);
  });

  it('rejects non-object body', () => {
    expect(() => validateCreateNotification(null)).toThrow(HttpError);
    expect(() => validateCreateNotification('string')).toThrow(HttpError);
    expect(() => validateCreateNotification(42)).toThrow(HttpError);
  });

  it('rejects missing userId', () => {
    const body = { ...validBody(), userId: undefined };
    expect(() => validateCreateNotification(body)).toThrow(HttpError);
  });

  it('rejects invalid userId UUID', () => {
    const body = { ...validBody(), userId: INVALID_UUID };
    expect(() => validateCreateNotification(body)).toThrow(HttpError);
  });

  it('rejects missing templateId', () => {
    const body = { ...validBody(), templateId: undefined };
    expect(() => validateCreateNotification(body)).toThrow(HttpError);
  });

  it('rejects invalid templateId UUID', () => {
    const body = { ...validBody(), templateId: INVALID_UUID };
    expect(() => validateCreateNotification(body)).toThrow(HttpError);
  });

  it('rejects missing channel', () => {
    const body = { ...validBody(), channel: undefined };
    expect(() => validateCreateNotification(body)).toThrow(HttpError);
  });

  it('rejects invalid channel', () => {
    const body = { ...validBody(), channel: 'PUSH' };
    expect(() => validateCreateNotification(body)).toThrow(HttpError);
  });

  it('rejects missing category', () => {
    const body = { ...validBody(), category: undefined };
    expect(() => validateCreateNotification(body)).toThrow(HttpError);
  });

  it('rejects invalid category', () => {
    const body = { ...validBody(), category: 'PROMOTIONAL' };
    expect(() => validateCreateNotification(body)).toThrow(HttpError);
  });

  it('rejects invalid priority', () => {
    const body = { ...validBody(), priority: 'URGENT' };
    expect(() => validateCreateNotification(body)).toThrow(HttpError);
  });

  it('rejects non-object variables', () => {
    const body = { ...validBody(), variables: 'not-an-object' };
    expect(() => validateCreateNotification(body)).toThrow(HttpError);
  });

  it('rejects non-object metadata', () => {
    const body = { ...validBody(), metadata: 'not-an-object' };
    expect(() => validateCreateNotification(body)).toThrow(HttpError);
  });

  it('collects multiple validation errors', () => {
    try {
      validateCreateNotification({});
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.statusCode).toBe(400);
      expect(httpError.code).toBe('INVALID_REQUEST');
      // Should have errors for userId, templateId, channel, category
      expect(httpError.details.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('validateNotificationId', () => {
  it('accepts a valid UUID', () => {
    expect(validateNotificationId(VALID_UUID)).toBe(VALID_UUID);
  });

  it('rejects an invalid UUID', () => {
    expect(() => validateNotificationId(INVALID_UUID)).toThrow(HttpError);
  });

  it('rejects empty string', () => {
    expect(() => validateNotificationId('')).toThrow(HttpError);
  });
});

describe('validateListNotificationsQuery', () => {
  it('returns defaults for empty query', () => {
    const result = validateListNotificationsQuery({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.sort).toBe('createdAt');
    expect(result.order).toBe('desc');
    expect(result.status).toBeUndefined();
    expect(result.channel).toBeUndefined();
  });

  it('parses valid pagination parameters', () => {
    const result = validateListNotificationsQuery({ page: '3', limit: '10' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
  });

  it('parses valid filter parameters', () => {
    const result = validateListNotificationsQuery({
      status: 'DELIVERED',
      channel: 'EMAIL',
      category: 'SECURITY',
      priority: 'HIGH',
    });
    expect(result.status).toBe('DELIVERED');
    expect(result.channel).toBe('EMAIL');
    expect(result.category).toBe('SECURITY');
    expect(result.priority).toBe('HIGH');
  });

  it('parses valid sort parameters', () => {
    const result = validateListNotificationsQuery({ sort: 'status', order: 'asc' });
    expect(result.sort).toBe('status');
    expect(result.order).toBe('asc');
  });

  it('rejects invalid status', () => {
    expect(() => validateListNotificationsQuery({ status: 'INVALID' })).toThrow(HttpError);
  });

  it('rejects invalid channel', () => {
    expect(() => validateListNotificationsQuery({ channel: 'PUSH' })).toThrow(HttpError);
  });

  it('rejects invalid sort field', () => {
    expect(() => validateListNotificationsQuery({ sort: 'name' })).toThrow(HttpError);
  });

  it('rejects invalid order', () => {
    expect(() => validateListNotificationsQuery({ order: 'random' })).toThrow(HttpError);
  });

  it('rejects non-numeric page', () => {
    expect(() => validateListNotificationsQuery({ page: 'abc' })).toThrow(HttpError);
  });

  it('rejects limit exceeding max', () => {
    expect(() => validateListNotificationsQuery({ limit: '200' })).toThrow(HttpError);
  });

  it('rejects invalid userId format', () => {
    expect(() => validateListNotificationsQuery({ userId: INVALID_UUID })).toThrow(HttpError);
  });

  it('accepts valid userId', () => {
    const result = validateListNotificationsQuery({ userId: VALID_UUID });
    expect(result.userId).toBe(VALID_UUID);
  });

  it('handles non-record query gracefully', () => {
    const result = validateListNotificationsQuery(null);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });
});
