import { initializeKafkaTopics } from '../topic-initializer';
import { logger } from '../../logger';

async function run(): Promise<void> {
  try {
    logger.info('Starting Kafka topic initialization...');
    const result = await initializeKafkaTopics();
    logger.info(
      {
        created: result.createdTopics,
        existing: result.existingTopics,
      },
      'Kafka topic initialization finished successfully',
    );
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Kafka topic initialization failed');
    process.exit(1);
  }
}

void run();
