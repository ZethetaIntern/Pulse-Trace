import { logger } from '../../logger';
import { RetryScheduler } from '../../../modules/retry/services/retry-scheduler';

async function main(): Promise<void> {
  logger.info('Initializing PulseTrace Redis Retry Scheduler daemon...');

  const retryScheduler = new RetryScheduler();

  let isShuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, 'Shutting down Redis Retry Scheduler daemon...');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out (10s); forcing process exit');
      process.exit(1);
    }, 10000);

    try {
      await retryScheduler.stop();
      clearTimeout(forceExit);
      logger.info('Redis Retry Scheduler daemon shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during Redis Retry Scheduler shutdown');
      clearTimeout(forceExit);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await retryScheduler.start();
    logger.info('Redis Retry Scheduler daemon is running and polling due retries');
  } catch (error) {
    logger.fatal({ error }, 'Failed to start Redis Retry Scheduler daemon');
    process.exit(1);
  }
}

main().catch((error) => {
  logger.fatal({ error }, 'Unhandled exception in retry scheduler daemon entrypoint');
  process.exit(1);
});
