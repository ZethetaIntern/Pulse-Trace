import { Category, Channel, EventType, Priority } from '@prisma/client';
import { KafkaMessage } from 'kafkajs';
import { MessageValidator } from '../../../infrastructure/kafka/message-validator';

describe('MessageValidator Unit Tests', () => {
  const validPayload = {
    eventId: 'evt-uuid-1',
    eventType: EventType.NOTIFICATION_CREATED,
    notificationId: 'notif-uuid-1',
    userId: 'user-uuid-1',
    templateId: 'tpl-uuid-1',
    channel: Channel.EMAIL,
    category: Category.TRANSACTIONAL,
    priority: Priority.HIGH,
    payload: { name: 'Alice' },
    idempotencyKey: 'idemp-1',
    correlationId: 'req-corr-1',
    timestamp: '2026-09-13T10:00:00.000Z',
    retryCount: 0,
    metadata: { source: 'api' },
  };

  it('should successfully validate a well-formed KafkaMessage and extract headers', () => {
    const kafkaMessage: KafkaMessage = {
      key: Buffer.from('user-uuid-1'),
      value: Buffer.from(JSON.stringify(validPayload)),
      timestamp: '1789230000000',
      attributes: 0,
      offset: '42',
      headers: {
        'x-event-id': Buffer.from('evt-uuid-1'),
        'x-event-type': Buffer.from('NOTIFICATION_CREATED'),
        'x-correlation-id': Buffer.from('req-corr-1'),
      },
    };

    const result = MessageValidator.validate(kafkaMessage);

    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.payload.notificationId).toBe('notif-uuid-1');
      expect(result.payload.userId).toBe('user-uuid-1');
      expect(result.payload.channel).toBe(Channel.EMAIL);
      expect(result.payload.category).toBe(Category.TRANSACTIONAL);
      expect(result.payload.priority).toBe(Priority.HIGH);
      expect(result.payload.correlationId).toBe('req-corr-1');
      expect(result.headers['x-event-id']).toBe('evt-uuid-1');
      expect(result.headers['x-event-type']).toBe('NOTIFICATION_CREATED');
      expect(result.headers['x-correlation-id']).toBe('req-corr-1');
    }
  });

  it('should reject a null or empty message value', () => {
    const emptyMessage: KafkaMessage = {
      key: null,
      value: null,
      timestamp: '0',
      attributes: 0,
      offset: '0',
      headers: {},
    };

    const result = MessageValidator.validate(emptyMessage);
    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.error).toContain('null/empty');
    }
  });

  it('should reject malformed non-JSON message value', () => {
    const corruptMessage: KafkaMessage = {
      key: Buffer.from('key'),
      value: Buffer.from('INVALID_JSON_CONTENT{{{'),
      timestamp: '0',
      attributes: 0,
      offset: '1',
      headers: {},
    };

    const result = MessageValidator.validate(corruptMessage);
    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.error).toContain('valid JSON');
    }
  });

  it('should reject message when required fields are missing', () => {
    const missingNotificationId = { ...validPayload };
    delete (missingNotificationId as any).notificationId;

    const message: KafkaMessage = {
      key: Buffer.from('key'),
      value: Buffer.from(JSON.stringify(missingNotificationId)),
      timestamp: '0',
      attributes: 0,
      offset: '2',
      headers: {},
    };

    const result = MessageValidator.validate(message);
    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.error).toContain('notificationId');
    }
  });

  it('should reject invalid channel or priority enum values', () => {
    const invalidEnums = {
      ...validPayload,
      channel: 'CARRIER_PIGEON',
    };

    const message: KafkaMessage = {
      key: Buffer.from('key'),
      value: Buffer.from(JSON.stringify(invalidEnums)),
      timestamp: '0',
      attributes: 0,
      offset: '3',
      headers: {},
    };

    const result = MessageValidator.validate(message);
    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.error).toContain('channel');
    }
  });
});
