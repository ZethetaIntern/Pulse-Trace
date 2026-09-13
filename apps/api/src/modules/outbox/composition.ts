import { PrismaOutboxRepository } from './repositories/prisma-outbox-repository';
import { OutboxPublisher } from './services/outbox-publisher';
import { InMemoryPublisherSink } from './sinks/in-memory-publisher-sink';
import { KafkaPublisherSink } from './sinks/kafka-publisher-sink';

export const outboxRepository = new PrismaOutboxRepository();
export const inMemoryPublisherSink = new InMemoryPublisherSink();
export const kafkaPublisherSink = new KafkaPublisherSink();

/**
 * Default sink instance for the module.
 * Can be swapped or injected depending on runtime mode.
 */
export const outboxPublisherSink = inMemoryPublisherSink;
export const outboxPublisher = new OutboxPublisher(outboxRepository, outboxPublisherSink);

export function createKafkaOutboxPublisher(): OutboxPublisher {
  return new OutboxPublisher(outboxRepository, kafkaPublisherSink);
}

