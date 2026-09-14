import { NotificationDeadLetter, PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { CreateDeadLetterData, DeadLetterRepository } from '../interfaces/dead-letter-repository';

export class PrismaDeadLetterRepository implements DeadLetterRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  createDeadLetter(data: CreateDeadLetterData): Promise<NotificationDeadLetter> {
    return this.db.notificationDeadLetter.upsert({
      where: { notificationId: data.notificationId },
      create: {
        notificationId: data.notificationId,
        originalPayload: data.originalPayload,
        failedAttempts: data.failedAttempts,
        lastErrorCode: data.lastErrorCode,
        lastErrorMessage: data.lastErrorMessage,
        errorDetails: data.errorDetails ?? [],
      },
      update: {
        failedAttempts: data.failedAttempts,
        lastErrorCode: data.lastErrorCode,
        lastErrorMessage: data.lastErrorMessage,
        errorDetails: data.errorDetails ?? [],
      },
    });
  }

  findDeadLetterByNotificationId(notificationId: string): Promise<NotificationDeadLetter | null> {
    return this.db.notificationDeadLetter.findUnique({
      where: { notificationId },
    });
  }

  async resolveDeadLetter(notificationId: string, resolvedBy?: string): Promise<NotificationDeadLetter | null> {
    const existing = await this.db.notificationDeadLetter.findUnique({ where: { notificationId } });
    if (!existing) {
      return null;
    }
    return this.db.notificationDeadLetter.update({
      where: { notificationId },
      data: {
        resolvedAt: new Date(),
        ...(resolvedBy ? { resolvedBy } : {}),
      },
    });
  }

  countDeadLetters(): Promise<number> {
    return this.db.notificationDeadLetter.count();
  }
}
