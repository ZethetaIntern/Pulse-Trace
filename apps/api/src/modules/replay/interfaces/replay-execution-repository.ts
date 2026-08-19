import { ReplayExecution } from '@prisma/client';

export interface CreateReplayExecutionInput {
  originalNotificationId: string;
  reason?: string;
  triggeredBy?: string;
}

/**
 * Data-access contract for the replay module.
 * All Prisma access is hidden behind this interface.
 */
export interface ReplayExecutionRepository {
  createReplayExecution(input: CreateReplayExecutionInput): Promise<ReplayExecution>;
  updateNewNotificationId(id: string, newNotificationId: string): Promise<ReplayExecution>;
  findById(id: string): Promise<ReplayExecution | null>;
  findByOriginalNotificationId(originalNotificationId: string): Promise<ReplayExecution[]>;
}
