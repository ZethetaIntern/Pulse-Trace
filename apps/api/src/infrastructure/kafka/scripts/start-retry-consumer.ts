import { prisma } from '../../database/prisma';
import { logger } from '../../logger';
import { PrismaNotificationRepository } from '../../../modules/notifications/repositories/prisma-notification-repository';
import { PrismaNotificationEventRepository } from '../../../modules/notifications/repositories/prisma-notification-event-repository';
import { PrismaDeadLetterRepository } from '../../../modules/dlq/repositories/prisma-dead-letter-repository';
import { NotificationService } from '../../../modules/notifications/services/notification-service';
import { notificationQueue } from '../../queue/notification-queue';
import { RetryScheduler } from '../../../modules/retry/services/retry-scheduler';
import { DlqService } from '../../../modules/dlq/services/dlq-service';
import { RetryConsumer } from '../retry-consumer';

async function main(): Promise<void> {
  logger.info('Initializing PulseTrace Kafka Retry Consumer worker...');

  const notificationRepo = new PrismaNotificationRepository(prisma);
  const eventRepo = new PrismaNotificationEventRepository(prisma);
  const deadLetterRepo = new PrismaDeadLetterRepository(prisma);

  const notificationService = new NotificationService(
    notificationRepo,
    eventRepo,
    notificationQueue,
  );

  const retryScheduler = new RetryScheduler();
  const dlqService = new DlqService(deadLetterRepo, notificationRepo, eventRepo);

  const retryConsumer = new RetryConsumer(
    notificationService,
    eventRepo,
    {
      retryScheduler,
      dlqService,
      notificationRepository: notificationRepo,
    },
  );

  let isShuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, 'Shutting down Kafka retry consumer worker...');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out (10s); forcing process exit');
      process.exit(1);
    }, 10000);

    try {
      await retryConsumer.stop();
      await retryScheduler.stop();
      await notificationQueue.close();
      await prisma.$disconnect();
      clearTimeout(forceExit);
      logger.info('Kafka retry consumer worker shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during Kafka retry consumer worker shutdown');
      clearTimeout(forceExit);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await retryConsumer.start();
    logger.info('Kafka retry consumer worker is now running and listening for events');
  } catch (error) {
    logger.fatal({ error }, 'Failed to start Kafka retry consumer worker');
    process.exit(1);
  }
}

main().catch((error) => {
  logger.fatal({ error }, 'Unhandled exception in retry consumer worker entrypoint');
  process.exit(1);
});
