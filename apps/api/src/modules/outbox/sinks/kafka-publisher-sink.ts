import { OutboxEvent } from '@prisma/client';
import { Producer } from 'kafkajs';
import { OutboxPublisherSink } from '../interfaces/outbox-publisher-sink';
import { createKafkaProducer } from '../../../infrastructure/kafka/kafka-client';
import { logger } from '../../../infrastructure/logger';

export class KafkaPublisherSink implements OutboxPublisherSink {
  private isConnected = false;
  private connectPromise: Promise<void> | null = null;

  constructor(private readonly producer: Producer = createKafkaProducer()) {}

  /**
   * Connects the underlying Kafka producer lazily or explicitly.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }
    if (!this.connectPromise) {
      this.connectPromise = this.producer
        .connect()
        .then(() => {
          this.isConnected = true;
          this.connectPromise = null;
          logger.info('KafkaPublisherSink connected to Kafka broker');
        })
        .catch((error) => {
          this.connectPromise = null;
          logger.error({ error }, 'KafkaPublisherSink failed to connect to Kafka broker');
          throw error;
        });
    }
    await this.connectPromise;
  }

  /**
   * Disconnects the underlying Kafka producer.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    try {
      await this.producer.disconnect();
      this.isConnected = false;
      logger.info('KafkaPublisherSink disconnected from Kafka broker');
    } catch (error) {
      logger.warn({ error }, 'Error disconnecting KafkaPublisherSink');
    }
  }

  /**
   * Publishes a single OutboxEvent to its target Kafka topic.
   * Throws on failure to ensure OutboxPublisher manages retry semantics.
   */
  async publish(event: OutboxEvent): Promise<void> {
    await this.connect();

    const payloadObj = typeof event.payload === 'object' && event.payload !== null
      ? (event.payload as Record<string, unknown>)
      : {};

    const correlationId = typeof payloadObj.correlationId === 'string'
      ? payloadObj.correlationId
      : '';

    const payloadString = typeof event.payload === 'string'
      ? event.payload
      : JSON.stringify(event.payload);

    try {
      const recordMetadata = await this.producer.send({
        topic: event.topic,
        messages: [
          {
            key: event.partitionKey,
            value: payloadString,
            headers: {
              'x-event-id': event.id,
              'x-event-type': event.eventType,
              'x-correlation-id': correlationId,
            },
          },
        ],
      });

      logger.debug(
        {
          eventId: event.id,
          topic: event.topic,
          partitionKey: event.partitionKey,
          partitions: recordMetadata.map((m) => m.partition),
        },
        'Published outbox event to Kafka',
      );
    } catch (error) {
      logger.error(
        {
          eventId: event.id,
          topic: event.topic,
          partitionKey: event.partitionKey,
          error: (error as Error).message,
        },
        'Failed to publish outbox event to Kafka',
      );
      throw error;
    }
  }
}
