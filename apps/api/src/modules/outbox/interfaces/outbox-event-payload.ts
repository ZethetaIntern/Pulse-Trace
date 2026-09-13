import { Category, Channel, EventType, Priority } from '@prisma/client';

/**
 * Standardized distributed event schema matching Section 7.1 of Phase 15.
 * Contains all necessary metadata for downstream streaming and delivery.
 */
export interface PulseTraceOutboxPayload {
  eventId: string;
  eventType: EventType;
  notificationId: string;
  userId: string;
  templateId: string;
  channel: Channel;
  category: Category;
  priority: Priority;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  correlationId: string;
  timestamp: string;
  retryCount: number;
  metadata: Record<string, unknown>;
}

/**
 * Resolves the appropriate Kafka topic for a given notification priority.
 */
export function resolveTopicForPriority(priority: Priority): string {
  switch (priority) {
    case Priority.CRITICAL:
    case Priority.HIGH:
      return 'notifications.high';
    case Priority.LOW:
      return 'notifications.low';
    case Priority.NORMAL:
    default:
      return 'notifications.normal';
  }
}
