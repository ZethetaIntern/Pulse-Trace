import { PrismaOutboxRepository } from './repositories/prisma-outbox-repository';
import { OutboxPublisher } from './services/outbox-publisher';
import { InMemoryPublisherSink } from './sinks/in-memory-publisher-sink';

export const outboxRepository = new PrismaOutboxRepository();
export const outboxPublisherSink = new InMemoryPublisherSink();
export const outboxPublisher = new OutboxPublisher(outboxRepository, outboxPublisherSink);
