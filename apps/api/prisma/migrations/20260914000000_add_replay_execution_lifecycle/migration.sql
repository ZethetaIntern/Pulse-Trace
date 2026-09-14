-- CreateEnum
CREATE TYPE "ReplayStatus" AS ENUM ('REQUESTED', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "ReplayExecutions" 
  ADD COLUMN "status" "ReplayStatus" NOT NULL DEFAULT 'REQUESTED',
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ReplayExecutions_status_idx" ON "ReplayExecutions"("status");

-- Partial Unique Index: Ensures at most one active replay per original notification
CREATE UNIQUE INDEX "unique_active_replay_per_original" 
  ON "ReplayExecutions"("originalNotificationId") 
  WHERE "status" IN ('REQUESTED', 'RUNNING');
