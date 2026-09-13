-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "OutboxEvents" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL DEFAULT 'Notification',
    "aggregateId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "topic" TEXT NOT NULL,
    "partitionKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboxEvents_status_createdAt_idx" ON "OutboxEvents"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvents_aggregateId_idx" ON "OutboxEvents"("aggregateId");

-- AddForeignKey
ALTER TABLE "OutboxEvents" ADD CONSTRAINT "OutboxEvents_aggregateId_fkey" FOREIGN KEY ("aggregateId") REFERENCES "Notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
