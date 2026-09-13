import { NotificationConsumer } from '../notification-consumer';
import { notificationService } from '../../../modules/notifications/composition';
import { PrismaNotificationEventRepository } from '../../../modules/notifications/repositories/prisma-notification-event-repository';
import { PrismaReplayExecutionRepository } from '../../../modules/replay/repositories/prisma-replay-execution-repository';
import { prisma } from '../../database/prisma';
import { logger } from '../../logger';

async function main(): Promise<void> {
  const eventRepository = new PrismaNotificationEventRepository(prisma);
  const replayExecutionRepository = new PrismaReplayExecutionRepository(prisma);

  const consumer = new NotificationConsumer(
    notificationService,
    eventRepository,
    replayExecutionRepository,
  );

  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, 'Shutting down Kafka notification consumer worker...');

    const forceTimer = setTimeout(() => {
      logger.warn('Forcing Kafka consumer worker exit after timeout');
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    try {
      await consumer.stop();
      await prisma.$disconnect();
      clearTimeout(forceTimer);
      logger.info('Kafka consumer worker shutdown cleanly');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during consumer worker shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    logger.info('Starting standalone Kafka notification consumer worker...');
    await consumer.start();
  } catch (error) {
    logger.error({ error }, 'Fatal error starting Kafka consumer worker');
    process.exit(1);
  }
}

void main();
