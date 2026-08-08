import { EventType, NotificationEvent, NotificationStatus, Prisma } from '@prisma/client';

export interface RecordNotificationEventInput {
  notificationId: string;
  eventType: EventType;
  /** Notification status before the transition, when the event records one. */
  statusBefore?: NotificationStatus;
  /** Notification status after the transition, when the event records one. */
  statusAfter?: NotificationStatus;
  /** Groups events belonging to a single execution (e.g. a BullMQ job id). */
  executionId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Append-only access to the immutable notification event history.
 */
export interface NotificationEventRepository {
  recordEvent(input: RecordNotificationEventInput): Promise<NotificationEvent>;
}