import { Channel, Category, Priority, EventType } from '@prisma/client';

export interface RetryJobEnvelope {
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
  retryCount: number; // 0-indexed count of prior retries
  metadata: {
    attemptNumber: number;      // The attempt that just failed (e.g. 1)
    nextAttemptNumber: number;  // The upcoming retry attempt to execute (e.g. 2)
    scheduledAt: string;        // ISO timestamp
    scheduledFor: string;       // ISO timestamp
    delayMs: number;
    reason: string;
    error: string;
    lastErrorCode?: string;
    [key: string]: unknown;
  };
}
