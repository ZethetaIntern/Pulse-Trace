-- CreateTable
CREATE TABLE "NotificationDeadLetters" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "originalPayload" JSONB NOT NULL,
    "failedAttempts" INTEGER NOT NULL,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "errorDetails" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "NotificationDeadLetters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDeadLetters_notificationId_key" ON "NotificationDeadLetters"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationDeadLetters_createdAt_idx" ON "NotificationDeadLetters"("createdAt");

-- AddForeignKey
ALTER TABLE "NotificationDeadLetters" ADD CONSTRAINT "NotificationDeadLetters_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
