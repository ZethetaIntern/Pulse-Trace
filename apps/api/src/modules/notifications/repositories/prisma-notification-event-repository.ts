import { NotificationEvent, PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import {
  NotificationEventRepository,
  RecordNotificationEventInput,
} from '../interfaces/notification-event-repository';

/**
 * Prisma-backed store for the immutable notification event history.
 * Events are append-only; no business logic lives here.
 */
export class PrismaNotificationEventRepository implements NotificationEventRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  recordEvent(input: RecordNotificationEventInput): Promise<NotificationEvent> {
    return this.db.notificationEvent.create({
      data: {
        notificationId: input.notificationId,
        eventType: input.eventType,
        statusBefore: input.statusBefore,
        statusAfter: input.statusAfter,
        executionId: input.executionId,
        metadata: input.metadata,
      },
    });
  }
}