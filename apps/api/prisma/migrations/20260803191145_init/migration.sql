-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('CREATED', 'QUEUED', 'PROCESSING', 'DELIVERED', 'FAILED', 'RETRY_PENDING', 'DLQ', 'SKIPPED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'SMS', 'IN_APP');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('TRANSACTIONAL', 'SECURITY', 'SYSTEM', 'INFORMATIONAL');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('NOTIFICATION_CREATED', 'REQUEST_VALIDATED', 'NOTIFICATION_STORED', 'JOB_QUEUED', 'WORKER_STARTED', 'WORKER_COMPLETED', 'PREFERENCE_CHECKED', 'TEMPLATE_RESOLVED', 'TEMPLATE_RENDERED', 'CHANNEL_SELECTED', 'PROVIDER_INVOKED', 'DELIVERY_SUCCEEDED', 'DELIVERY_FAILED', 'RETRY_SCHEDULED', 'RETRY_STARTED', 'REPLAY_CREATED', 'REPLAY_REQUESTED', 'REPLAY_STARTED', 'REPLAY_COMPLETED', 'DLQ_MOVED');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "category" "Category" NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "status" "NotificationStatus" NOT NULL DEFAULT 'CREATED',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEvents" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "statusBefore" "NotificationStatus",
    "statusAfter" "NotificationStatus",
    "executionId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEvents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplayExecutions" (
    "id" TEXT NOT NULL,
    "originalNotificationId" TEXT NOT NULL,
    "newNotificationId" TEXT,
    "reason" TEXT,
    "triggeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplayExecutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "category" "Category" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE INDEX "Templates_name_idx" ON "Templates"("name");

-- CreateIndex
CREATE INDEX "Templates_channel_idx" ON "Templates"("channel");

-- CreateIndex
CREATE INDEX "Notifications_status_idx" ON "Notifications"("status");

-- CreateIndex
CREATE INDEX "Notifications_createdAt_idx" ON "Notifications"("createdAt");

-- CreateIndex
CREATE INDEX "Notifications_userId_idx" ON "Notifications"("userId");

-- CreateIndex
CREATE INDEX "NotificationEvents_notificationId_idx" ON "NotificationEvents"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationEvents_occurredAt_idx" ON "NotificationEvents"("occurredAt");

-- CreateIndex
CREATE INDEX "NotificationEvents_eventType_idx" ON "NotificationEvents"("eventType");

-- CreateIndex
CREATE INDEX "NotificationEvents_executionId_idx" ON "NotificationEvents"("executionId");

-- CreateIndex
CREATE INDEX "ReplayExecutions_originalNotificationId_idx" ON "ReplayExecutions"("originalNotificationId");

-- CreateIndex
CREATE INDEX "ReplayExecutions_newNotificationId_idx" ON "ReplayExecutions"("newNotificationId");

-- CreateIndex
CREATE INDEX "UserPreferences_channel_idx" ON "UserPreferences"("channel");

-- CreateIndex
CREATE INDEX "UserPreferences_category_idx" ON "UserPreferences"("category");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_channel_category_key" ON "UserPreferences"("userId", "channel", "category");

-- AddForeignKey
ALTER TABLE "Notifications" ADD CONSTRAINT "Notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notifications" ADD CONSTRAINT "Notifications_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvents" ADD CONSTRAINT "NotificationEvents_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplayExecutions" ADD CONSTRAINT "ReplayExecutions_originalNotificationId_fkey" FOREIGN KEY ("originalNotificationId") REFERENCES "Notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplayExecutions" ADD CONSTRAINT "ReplayExecutions_newNotificationId_fkey" FOREIGN KEY ("newNotificationId") REFERENCES "Notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
