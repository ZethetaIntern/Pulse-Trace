import { EventType, NotificationStatus, Prisma } from '@prisma/client';
import { logger } from '../../../infrastructure/logger';
import { DeadLetterRepository } from '../interfaces/dead-letter-repository';
import { NotificationRepository } from '../../notifications/interfaces/notification-repository';
import { NotificationEventRepository } from '../../notifications/interfaces/notification-event-repository';
import { OutboxPublisherSink } from '../../outbox/interfaces/outbox-publisher-sink';
import { KafkaPublisherSink } from '../../outbox/sinks/kafka-publisher-sink';

export const DLQ_TOPIC = 'notifications.dlq';

export interface MoveToDlqInput {
  notificationId: string;
  userId: string;
  eventId: string;
  originalPayload: Record<string, unknown>;
  failedAttempts: number;
  reason: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  errorDetails?: unknown;
  workerId?: string;
  executionId?: string;
  correlationId?: string;
  channel?: string;
  category?: string;
  priority?: string;
}

export class DlqService {
  private readonly sink: OutboxPublisherSink;

  constructor(
    private readonly deadLetterRepository: DeadLetterRepository,
    private readonly notificationRepository: NotificationRepository,
    private readonly eventRepository: NotificationEventRepository,
    sink?: OutboxPublisherSink,
  ) {
    this.sink = sink || new KafkaPublisherSink();
  }

  /**
   * Durably records a dead-lettered notification in PostgreSQL and publishes to Kafka notifications.dlq.
   *
   * Note: In Phase 19, PostgreSQL persistence and Kafka DLQ publication are performed sequentially
   * and are non-atomic. If a crash occurs after DB write, PostgreSQL remains the durable source of truth.
   */
  async moveToDlq(input: MoveToDlqInput): Promise<void> {
    logger.warn(
      {
        notificationId: input.notificationId,
        failedAttempts: input.failedAttempts,
        reason: input.reason,
        errorCode: input.lastErrorCode,
      },
      'Transitioning notification to Dead-Letter Queue (DLQ)',
    );

    // 1. Persist durable Dead-Letter record in PostgreSQL
    await this.deadLetterRepository.createDeadLetter({
      notificationId: input.notificationId,
      originalPayload: input.originalPayload as Prisma.InputJsonValue,
      failedAttempts: input.failedAttempts,
      lastErrorCode: input.lastErrorCode,
      lastErrorMessage: input.lastErrorMessage,
      errorDetails: (input.errorDetails ?? []) as Prisma.InputJsonValue,
    });

    // 2. Update Notification status to DLQ
    await this.notificationRepository.updateNotificationStatus(
      input.notificationId,
      NotificationStatus.DLQ,
    );

    // 3. Emit DLQ_MOVED lifecycle event
    await this.eventRepository.recordEvent({
      notificationId: input.notificationId,
      eventType: EventType.DLQ_MOVED,
      statusBefore: NotificationStatus.PROCESSING,
      statusAfter: NotificationStatus.DLQ,
      executionId: input.executionId || input.eventId,
      metadata: {
        notificationId: input.notificationId,
        failedAttempts: input.failedAttempts,
        reason: input.reason,
        errorCode: input.lastErrorCode,
        errorMessage: input.lastErrorMessage,
        workerId: input.workerId,
        correlationId: input.correlationId,
      },
    });

    // 4. Publish DLQ event to Kafka topic notifications.dlq
    const dlqPayload = {
      notificationId: input.notificationId,
      userId: input.userId,
      eventId: input.eventId,
      channel: input.channel,
      category: input.category,
      priority: input.priority,
      failedAttempts: input.failedAttempts,
      reason: input.reason,
      lastErrorCode: input.lastErrorCode,
      lastErrorMessage: input.lastErrorMessage,
      errorDetails: input.errorDetails,
      originalPayload: input.originalPayload,
      deadLetteredAt: new Date().toISOString(),
    };

    try {
      await this.sink.publish({
        id: input.eventId,
        aggregateType: 'Notification',
        aggregateId: input.notificationId,
        eventType: EventType.DLQ_MOVED,
        topic: DLQ_TOPIC,
        partitionKey: input.userId,
        payload: dlqPayload as unknown as Prisma.JsonValue,
        status: 'PENDING',
        retryCount: 0,
        lastError: null,
        lockedAt: null,
        lockedBy: null,
        createdAt: new Date(),
        publishedAt: null,
      });

      logger.info(
        { notificationId: input.notificationId, topic: DLQ_TOPIC },
        'Successfully published DLQ event to Kafka',
      );
    } catch (publishError) {
      logger.error(
        {
          notificationId: input.notificationId,
          error: (publishError as Error).message,
        },
        'Failed to publish DLQ event to Kafka; durable DB record remains persisted',
      );
      // We do not rethrow to avoid masking DB persistence, but the error is logged.
    }
  }
}
