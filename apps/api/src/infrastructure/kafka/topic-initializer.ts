import { Admin, ITopicConfig } from 'kafkajs';
import { createKafkaAdmin } from './kafka-client';
import { logger } from '../logger';

export const REQUIRED_KAFKA_TOPICS = [
  'notifications.high',
  'notifications.normal',
  'notifications.low',
  'notifications.retry',
  'notifications.dlq',
] as const;

export type RequiredKafkaTopic = (typeof REQUIRED_KAFKA_TOPICS)[number];

export const DEFAULT_PARTITION_COUNT = 4;
export const DEFAULT_REPLICATION_FACTOR = 1;

export interface TopicInitOptions {
  numPartitions?: number;
  replicationFactor?: number;
  admin?: Admin;
}

export interface TopicInitResult {
  createdTopics: string[];
  existingTopics: string[];
}

/**
 * Deterministically ensures that all required PulseTrace Kafka topics exist.
 * Safe to execute repeatedly (idempotent).
 */
export async function initializeKafkaTopics(options: TopicInitOptions = {}): Promise<TopicInitResult> {
  const numPartitions = options.numPartitions ?? DEFAULT_PARTITION_COUNT;
  const replicationFactor = options.replicationFactor ?? DEFAULT_REPLICATION_FACTOR;
  const shouldDisconnect = !options.admin;
  const admin = options.admin || createKafkaAdmin();

  try {
    if (shouldDisconnect) {
      await admin.connect();
    }

    const currentTopics = await admin.listTopics();
    const existingTopics = REQUIRED_KAFKA_TOPICS.filter((topic) => currentTopics.includes(topic));
    const missingTopics = REQUIRED_KAFKA_TOPICS.filter((topic) => !currentTopics.includes(topic));

    if (missingTopics.length === 0) {
      logger.info(
        { existingTopics, count: existingTopics.length },
        'All required Kafka topics already exist; skipping creation',
      );
      return {
        createdTopics: [],
        existingTopics: [...existingTopics],
      };
    }

    const topicConfigs: ITopicConfig[] = missingTopics.map((topic) => ({
      topic,
      numPartitions,
      replicationFactor,
    }));

    logger.info(
      { missingTopics, numPartitions, replicationFactor },
      'Creating missing Kafka topics...',
    );

    await admin.createTopics({
      topics: topicConfigs,
      waitForLeaders: true,
    });

    logger.info(
      { createdTopics: missingTopics },
      'Successfully initialized Kafka topics',
    );

    return {
      createdTopics: missingTopics,
      existingTopics: [...existingTopics],
    };
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Kafka topics');
    throw error;
  } finally {
    if (shouldDisconnect) {
      try {
        await admin.disconnect();
      } catch (disconnectError) {
        logger.warn({ error: disconnectError }, 'Error disconnecting Kafka admin after topic initialization');
      }
    }
  }
}
