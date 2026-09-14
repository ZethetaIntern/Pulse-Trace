import { NotificationDeadLetter, Prisma } from '@prisma/client';

export interface CreateDeadLetterData {
  notificationId: string;
  originalPayload: Prisma.InputJsonValue;
  failedAttempts: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  errorDetails?: Prisma.InputJsonValue;
}

export interface DeadLetterRepository {
  createDeadLetter(data: CreateDeadLetterData): Promise<NotificationDeadLetter>;
  findDeadLetterByNotificationId(notificationId: string): Promise<NotificationDeadLetter | null>;
  resolveDeadLetter(notificationId: string, resolvedBy?: string): Promise<NotificationDeadLetter | null>;
  countDeadLetters(): Promise<number>;
}
