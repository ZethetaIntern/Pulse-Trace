import { PrismaClient, ReplayExecution } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import {
  CreateReplayExecutionInput,
  ReplayExecutionRepository,
} from '../interfaces/replay-execution-repository';

/**
 * Prisma-backed repository for the ReplayExecution table.
 * Contains only database access; no business logic lives here.
 */
export class PrismaReplayExecutionRepository implements ReplayExecutionRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async createReplayExecution(input: CreateReplayExecutionInput): Promise<ReplayExecution> {
    return this.db.replayExecution.create({
      data: {
        originalNotificationId: input.originalNotificationId,
        reason: input.reason,
        triggeredBy: input.triggeredBy,
      },
    });
  }

  async updateNewNotificationId(id: string, newNotificationId: string): Promise<ReplayExecution> {
    return this.db.replayExecution.update({
      where: { id },
      data: { newNotificationId },
    });
  }

  async findById(id: string): Promise<ReplayExecution | null> {
    return this.db.replayExecution.findUnique({ where: { id } });
  }

  async findByOriginalNotificationId(originalNotificationId: string): Promise<ReplayExecution[]> {
    return this.db.replayExecution.findMany({
      where: { originalNotificationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findReplayExecutionByNewNotificationId(newNotificationId: string): Promise<ReplayExecution | null> {
    return this.db.replayExecution.findFirst({
      where: { newNotificationId },
    });
  }
}
