import { OutboxEvent, OutboxStatus, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { CreateOutboxEventInput, OutboxRepository } from '../interfaces/outbox-repository';

export class PrismaOutboxRepository implements OutboxRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async createOutboxEvent(input: CreateOutboxEventInput, tx?: Prisma.TransactionClient): Promise<OutboxEvent> {
    const client = tx ?? this.db;
    return client.outboxEvent.create({
      data: {
        aggregateType: input.aggregateType ?? 'Notification',
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        topic: input.topic,
        partitionKey: input.partitionKey,
        payload: input.payload as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
      },
    });
  }

  async claimBatch(batchSize: number, lockTtlMs: number, lockedBy: string): Promise<OutboxEvent[]> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - lockTtlMs);

    return this.db.$queryRaw<OutboxEvent[]>`
      UPDATE "OutboxEvents"
      SET
        "status" = 'PROCESSING'::"OutboxStatus",
        "lockedAt" = ${now},
        "lockedBy" = ${lockedBy}
      WHERE "id" IN (
        SELECT "id"
        FROM "OutboxEvents"
        WHERE (
          "status" = 'PENDING'::"OutboxStatus"
          OR "status" = 'FAILED'::"OutboxStatus"
          OR ("status" = 'PROCESSING'::"OutboxStatus" AND ("lockedAt" IS NULL OR "lockedAt" < ${staleThreshold}))
        )
        AND "retryCount" < 5
        ORDER BY "createdAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;
  }

  async markPublished(id: string, publishedAt: Date = new Date()): Promise<void> {
    await this.db.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.PUBLISHED,
        publishedAt,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async markFailed(id: string, error: string, retryCount: number): Promise<void> {
    await this.db.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.FAILED,
        retryCount,
        lastError: error,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async findOutboxEventById(id: string): Promise<OutboxEvent | null> {
    return this.db.outboxEvent.findUnique({ where: { id } });
  }

  async findPendingEvents(limit: number = 100): Promise<OutboxEvent[]> {
    return this.db.outboxEvent.findMany({
      where: {
        status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async countByStatus(): Promise<{ pending: number; processing: number; published: number; failed: number }> {
    const counts = await this.db.outboxEvent.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const result = {
      pending: 0,
      processing: 0,
      published: 0,
      failed: 0,
    };

    for (const row of counts) {
      if (row.status === OutboxStatus.PENDING) result.pending = row._count.id;
      if (row.status === OutboxStatus.PROCESSING) result.processing = row._count.id;
      if (row.status === OutboxStatus.PUBLISHED) result.published = row._count.id;
      if (row.status === OutboxStatus.FAILED) result.failed = row._count.id;
    }

    return result;
  }
}
