import { PrismaClient, ReplayExecution, ReplayStatus } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import {
  CreateReplayExecutionInput,
  ReplayExecutionRepository,
  UpdateReplayStatusInput,
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
        status: ReplayStatus.REQUESTED,
      },
    });
  }

  async updateNewNotificationId(id: string, newNotificationId: string): Promise<ReplayExecution> {
    return this.db.replayExecution.update({
      where: { id },
      data: { newNotificationId },
    });
  }

  async updateStatus(id: string, update: UpdateReplayStatusInput): Promise<ReplayExecution> {
    return this.db.replayExecution.update({
      where: { id },
      data: {
        status: update.status,
        ...(update.errorMessage !== undefined ? { errorMessage: update.errorMessage } : {}),
        ...(update.startedAt !== undefined ? { startedAt: update.startedAt } : {}),
        ...(update.completedAt !== undefined ? { completedAt: update.completedAt } : {}),
      },
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

  async findActiveReplayByOriginalId(originalNotificationId: string): Promise<ReplayExecution | null> {
    return this.db.replayExecution.findFirst({
      where: {
        originalNotificationId,
        status: { in: [ReplayStatus.REQUESTED, ReplayStatus.RUNNING] },
      },
    });
  }

  async findReplayExecutionByNewNotificationId(newNotificationId: string): Promise<ReplayExecution | null> {
    return this.db.replayExecution.findFirst({
      where: { newNotificationId },
    });
  }
}
