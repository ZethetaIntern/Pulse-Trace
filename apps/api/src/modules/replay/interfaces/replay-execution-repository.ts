import { ReplayExecution, ReplayStatus } from '@prisma/client';

export interface CreateReplayExecutionInput {
  originalNotificationId: string;
  reason?: string;
  triggeredBy?: string;
}

export interface UpdateReplayStatusInput {
  status: ReplayStatus;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Data-access contract for the replay module.
 * All Prisma access is hidden behind this interface.
 */
export interface ReplayExecutionRepository {
  createReplayExecution(input: CreateReplayExecutionInput): Promise<ReplayExecution>;
  updateNewNotificationId(id: string, newNotificationId: string): Promise<ReplayExecution>;
  updateStatus(id: string, update: UpdateReplayStatusInput): Promise<ReplayExecution>;
  findById(id: string): Promise<ReplayExecution | null>;
  findByOriginalNotificationId(originalNotificationId: string): Promise<ReplayExecution[]>;
  findActiveReplayByOriginalId(originalNotificationId: string): Promise<ReplayExecution | null>;
  findReplayExecutionByNewNotificationId(newNotificationId: string): Promise<ReplayExecution | null>;
}
