import { OutboxEvent } from '@prisma/client';

/**
 * Abstract publication sink.
 * In Phase 16, this is fulfilled by test / in-memory / dev sinks.
 * In Phase 17, this is fulfilled by the real Kafka Producer sink.
 */
export interface OutboxPublisherSink {
  publish(event: OutboxEvent): Promise<void>;
}
