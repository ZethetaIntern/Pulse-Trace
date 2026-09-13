import { KafkaMessage } from 'kafkajs';
import { Category, Channel, EventType, Priority } from '@prisma/client';
import { PulseTraceOutboxPayload } from '../../modules/outbox/interfaces/outbox-event-payload';

export interface ValidationSuccess {
  isValid: true;
  payload: PulseTraceOutboxPayload;
  headers: Record<string, string>;
}

export interface ValidationFailure {
  isValid: false;
  error: string;
}

export type MessageValidationResult = ValidationSuccess | ValidationFailure;

export class MessageValidator {
  /**
   * Validates a Kafka message against the Phase 16 PulseTraceOutboxPayload schema.
   */
  static validate(message: KafkaMessage): MessageValidationResult {
    if (!message || !message.value) {
      return { isValid: false, error: 'Kafka message or message value is null/empty' };
    }

    // Extract headers safely
    const headers: Record<string, string> = {};
    if (message.headers) {
      for (const [key, val] of Object.entries(message.headers)) {
        if (val) {
          headers[key] = val.toString();
        }
      }
    }

    let parsed: unknown;
    try {
      const rawString = message.value.toString('utf-8');
      parsed = JSON.parse(rawString);
    } catch {
      return { isValid: false, error: 'Message payload is not valid JSON' };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { isValid: false, error: 'Message payload is not a valid JSON object' };
    }

    const obj = parsed as Record<string, unknown>;

    // Required fields from PulseTraceOutboxPayload
    if (typeof obj.notificationId !== 'string' || obj.notificationId.trim().length === 0) {
      return { isValid: false, error: 'Missing or invalid required field: notificationId' };
    }

    if (typeof obj.userId !== 'string' || obj.userId.trim().length === 0) {
      return { isValid: false, error: 'Missing or invalid required field: userId' };
    }

    if (typeof obj.templateId !== 'string' || obj.templateId.trim().length === 0) {
      return { isValid: false, error: 'Missing or invalid required field: templateId' };
    }

    if (typeof obj.channel !== 'string' || !(obj.channel in Channel)) {
      return { isValid: false, error: `Missing or invalid required field: channel (${String(obj.channel)})` };
    }

    if (typeof obj.category !== 'string' || !(obj.category in Category)) {
      return { isValid: false, error: `Missing or invalid required field: category (${String(obj.category)})` };
    }

    if (typeof obj.priority !== 'string' || !(obj.priority in Priority)) {
      return { isValid: false, error: `Missing or invalid required field: priority (${String(obj.priority)})` };
    }

    if (typeof obj.eventType !== 'string' || !(obj.eventType in EventType)) {
      return { isValid: false, error: `Missing or invalid required field: eventType (${String(obj.eventType)})` };
    }

    const eventId = typeof obj.eventId === 'string' && obj.eventId.length > 0
      ? obj.eventId
      : headers['x-event-id'] || `event-${Date.now()}`;

    const correlationId = typeof obj.correlationId === 'string'
      ? obj.correlationId
      : headers['x-correlation-id'] || '';

    const payload: PulseTraceOutboxPayload = {
      eventId,
      eventType: obj.eventType as EventType,
      notificationId: obj.notificationId,
      userId: obj.userId,
      templateId: obj.templateId,
      channel: obj.channel as Channel,
      category: obj.category as Category,
      priority: obj.priority as Priority,
      payload: (typeof obj.payload === 'object' && obj.payload !== null ? obj.payload : {}) as Record<string, unknown>,
      idempotencyKey: typeof obj.idempotencyKey === 'string' ? obj.idempotencyKey : '',
      correlationId,
      timestamp: typeof obj.timestamp === 'string' ? obj.timestamp : new Date().toISOString(),
      retryCount: typeof obj.retryCount === 'number' ? obj.retryCount : 0,
      metadata: (typeof obj.metadata === 'object' && obj.metadata !== null ? obj.metadata : {}) as Record<string, unknown>,
    };

    return {
      isValid: true,
      payload,
      headers,
    };
  }
}
