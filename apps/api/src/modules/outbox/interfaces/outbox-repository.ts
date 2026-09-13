import { EventType, OutboxEvent, Prisma } from '@prisma/client';
import { PulseTraceOutboxPayload } from './outbox-event-payload';

export interface CreateOutboxEventInput {
  aggregateType?: string;
  aggregateId: string;
  eventType: EventType;
  topic: string;
  partitionKey: string;
  payload: PulseTraceOutboxPayload | Record<string, unknown>;
}

export interface OutboxRepository {
  createOutboxEvent(input: CreateOutboxEventInput, tx?: Prisma.TransactionClient): Promise<OutboxEvent>;
  claimBatch(batchSize: number, lockTtlMs: number, lockedBy: string): Promise<OutboxEvent[]>;
  markPublished(id: string, publishedAt?: Date): Promise<void>;
  markFailed(id: string, error: string, retryCount: number): Promise<void>;
  findOutboxEventById(id: string): Promise<OutboxEvent | null>;
  findPendingEvents(limit?: number): Promise<OutboxEvent[]>;
  countByStatus(): Promise<{ pending: number; processing: number; published: number; failed: number }>;
}
