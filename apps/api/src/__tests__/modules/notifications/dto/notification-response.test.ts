import { Notification, NotificationStatus, Channel, Category, Priority } from '@prisma/client';
import {
  toNotificationResponse,
  toCreateNotificationResponse,
} from '../../../../modules/notifications/dto/notification-response';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: '660e8400-e29b-41d4-a716-446655440001',
    templateId: '770e8400-e29b-41d4-a716-446655440002',
    channel: Channel.EMAIL,
    category: Category.TRANSACTIONAL,
    priority: Priority.NORMAL,
    status: NotificationStatus.CREATED,
    payload: { name: 'Alice' },
    metadata: { source: 'test' },
    createdAt: new Date('2026-08-20T12:00:00.000Z'),
    updatedAt: new Date('2026-08-20T12:00:05.000Z'),
    ...overrides,
  } as Notification;
}

describe('toNotificationResponse', () => {
  it('maps all fields correctly', () => {
    const notification = makeNotification();
    const result = toNotificationResponse(notification);

    expect(result.id).toBe(notification.id);
    expect(result.userId).toBe(notification.userId);
    expect(result.templateId).toBe(notification.templateId);
    expect(result.channel).toBe(Channel.EMAIL);
    expect(result.category).toBe(Category.TRANSACTIONAL);
    expect(result.priority).toBe(Priority.NORMAL);
    expect(result.status).toBe(NotificationStatus.CREATED);
    expect(result.payload).toEqual({ name: 'Alice' });
    expect(result.metadata).toEqual({ source: 'test' });
  });

  it('converts Date objects to ISO strings', () => {
    const notification = makeNotification();
    const result = toNotificationResponse(notification);

    expect(result.createdAt).toBe('2026-08-20T12:00:00.000Z');
    expect(result.updatedAt).toBe('2026-08-20T12:00:05.000Z');
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });

  it('preserves payload and metadata structure', () => {
    const notification = makeNotification({
      payload: { nested: { deep: true }, arr: [1, 2, 3] },
      metadata: { tags: ['a', 'b'] },
    });
    const result = toNotificationResponse(notification);

    expect(result.payload).toEqual({ nested: { deep: true }, arr: [1, 2, 3] });
    expect(result.metadata).toEqual({ tags: ['a', 'b'] });
  });

  it('handles empty payload and metadata', () => {
    const notification = makeNotification({
      payload: {},
      metadata: {},
    });
    const result = toNotificationResponse(notification);

    expect(result.payload).toEqual({});
    expect(result.metadata).toEqual({});
  });

  it('does not lose any fields', () => {
    const notification = makeNotification();
    const result = toNotificationResponse(notification);

    const expectedKeys = [
      'id', 'userId', 'templateId', 'channel', 'category',
      'priority', 'status', 'payload', 'metadata', 'createdAt', 'updatedAt',
    ];
    expect(Object.keys(result).sort()).toEqual(expectedKeys.sort());
  });
});

describe('toCreateNotificationResponse', () => {
  it('returns notificationId and status', () => {
    const notification = makeNotification({ status: NotificationStatus.QUEUED });
    const result = toCreateNotificationResponse(notification);

    expect(result.notificationId).toBe(notification.id);
    expect(result.status).toBe(NotificationStatus.QUEUED);
  });

  it('only contains notificationId and status fields', () => {
    const notification = makeNotification();
    const result = toCreateNotificationResponse(notification);

    expect(Object.keys(result)).toEqual(['notificationId', 'status']);
  });
});
