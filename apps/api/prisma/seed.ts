import { PrismaClient } from '@prisma/client';
import { Category, Channel, EventType, NotificationStatus, Priority, TemplateStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seeds a minimal, representative dataset that exercises every Phase 2 table:
 * User, Template, Notification, NotificationEvent, ReplayExecution and UserPreference.
 *
 * The seed is idempotent: it runs only when the database is empty.
 */
async function main(): Promise<void> {
  const existingUser = await prisma.user.findUnique({
    where: { email: 'alice@example.com' },
  });

  if (existingUser) {
    console.log('Seed skipped: data already present.');
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      name: 'Alice',
      phone: '+15551234567',
    },
  });

  const template = await prisma.template.create({
    data: {
      name: 'Welcome Email',
      channel: Channel.EMAIL,
      subject: 'Welcome to PulseTrace',
      body: 'Hello {{name}}, welcome to PulseTrace!',
      version: 1,
      status: TemplateStatus.PUBLISHED,
    },
  });

  const notification = await prisma.notification.create({
    data: {
      userId: user.id,
      templateId: template.id,
      channel: Channel.EMAIL,
      category: Category.TRANSACTIONAL,
      priority: Priority.NORMAL,
      status: NotificationStatus.CREATED,
      payload: { recipientName: 'Alice', templateVersion: 1 },
      metadata: { source: 'seed' },
    },
  });

  const notificationEvent = await prisma.notificationEvent.create({
    data: {
      notificationId: notification.id,
      eventType: EventType.NOTIFICATION_CREATED,
      statusAfter: NotificationStatus.CREATED,
      executionId: 'seed-execution-1',
      metadata: { source: 'seed' },
    },
  });

  const replayExecution = await prisma.replayExecution.create({
    data: {
      originalNotificationId: notification.id,
      reason: 'Seed: verify replay relation',
      triggeredBy: 'seed',
    },
  });

  await prisma.userPreference.create({
    data: {
      userId: user.id,
      channel: Channel.EMAIL,
      category: Category.TRANSACTIONAL,
      enabled: true,
    },
  });

  console.log('Seed complete:', {
    userId: user.id,
    templateId: template.id,
    notificationId: notification.id,
    eventId: notificationEvent.id,
    replayExecutionId: replayExecution.id,
  });
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
