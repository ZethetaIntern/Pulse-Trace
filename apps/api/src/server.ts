import { app, logger } from './app';
import { env } from './config/env';
import { prisma } from './infrastructure/database/prisma';
import { notificationQueue } from './infrastructure/queue/notification-queue';
import { NotificationWorker } from './infrastructure/queue/notification-worker';
import { PrismaNotificationEventRepository } from './modules/notifications/repositories/prisma-notification-event-repository';
import { PrismaReplayExecutionRepository } from './modules/replay/repositories/prisma-replay-execution-repository';
import { notificationService } from './modules/notifications/composition';
import { monitoringRepository } from './modules/monitoring/composition';

const notificationWorker = new NotificationWorker(
  notificationService,
  new PrismaNotificationEventRepository(),
  new PrismaReplayExecutionRepository(),
);

const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, 'Server started');
});

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info({ signal }, 'Shutting down gracefully...');

  const forceExitTimer = setTimeout(() => {
    logger.warn('Shutdown timed out; forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  server.close(async () => {
    logger.info('HTTP server closed');

    let shutdownError: Error | null = null;

    try {
      await notificationWorker.close();
      logger.info('Notification worker closed');
    } catch (error) {
      shutdownError = error as Error;
      logger.error({ error }, 'Error closing notification worker');
    }

    try {
      await notificationQueue.close();
      logger.info('Notification queue closed');
    } catch (error) {
      shutdownError = error as Error;
      logger.error({ error }, 'Error closing notification queue');
    }

    try {
      await monitoringRepository.close();
      logger.info('Monitoring repository closed');
    } catch (error) {
      shutdownError = error as Error;
      logger.error({ error }, 'Error closing monitoring repository');
    }

    try {
      await prisma.$disconnect();
      logger.info('Database disconnected');
    } catch (error) {
      shutdownError = error as Error;
      logger.error({ error }, 'Error disconnecting database');
    }

    clearTimeout(forceExitTimer);

    if (shutdownError) {
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  process.exit(1);
});

export { shutdown };