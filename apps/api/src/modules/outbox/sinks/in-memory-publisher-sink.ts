import { OutboxEvent } from '@prisma/client';
import { OutboxPublisherSink } from '../interfaces/outbox-publisher-sink';

export class InMemoryPublisherSink implements OutboxPublisherSink {
  private readonly events: OutboxEvent[] = [];
  private shouldFail = false;
  private failureError: Error = new Error('Simulated publication sink failure');

  async publish(event: OutboxEvent): Promise<void> {
    if (this.shouldFail) {
      throw this.failureError;
    }
    this.events.push(event);
  }

  getPublishedEvents(): OutboxEvent[] {
    return [...this.events];
  }

  setShouldFail(shouldFail: boolean, error?: Error): void {
    this.shouldFail = shouldFail;
    if (error) {
      this.failureError = error;
    }
  }

  clear(): void {
    this.events.length = 0;
    this.shouldFail = false;
  }
}
