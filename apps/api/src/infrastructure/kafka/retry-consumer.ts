import { Consumer, EachMessagePayload, Kafka } from 'kafkajs';
import { EventType, NotificationStatus, ReplayStatus } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../logger';
import { createKafkaInstance } from './kafka-client';
import { MessageValidator } from './message-validator';
import { NotificationProcessingService } from '../../modules/notifications/interfaces/notification-processing-service';
import { NotificationEventRepository } from '../../modules/notifications/interfaces/notification-event-repository';
import { NotificationRepository } from '../../modules/notifications/interfaces/notification-repository';
import { ReplayExecutionRepository } from '../../modules/replay/interfaces/replay-execution-repository';
import { FailureClassifier } from '../../modules/retry/services/failure-classifier';
import { BackoffCalculator } from '../../modules/retry/services/backoff-calculator';
import { RetryScheduler, RETRY_TOPIC } from '../../modules/retry/services/retry-scheduler';
import { DlqService } from '../../modules/dlq/services/dlq-service';
import { DeadLetterRepository } from '../../modules/dlq/interfaces/dead-letter-repository';

export interface RetryConsumerOptions {
  groupId?: string;
  concurrency?: number;
  topic?: string;
  kafka?: Kafka;
  workerId?: string;
  retryScheduler?: RetryScheduler;
  dlqService?: DlqService;
  notificationRepository?: NotificationRepository;
  replayExecutionRepository?: ReplayExecutionRepository;
  deadLetterRepository?: DeadLetterRepository;
}

export interface RetryConsumerStatus {
  isRunning: boolean;
  isConnected: boolean;
  groupId: string;
  subscribedTopic: string;
  assignedPartitions: Array<{ topic: string; partition: number }>;
  totalProcessed: number;
  lastProcessedAt: Date | null;
  lastError: string | null;
}

export class RetryConsumer {
  private readonly consumer: Consumer;
  private readonly groupId: string;
  private readonly topic: string;
  private readonly concurrency: number;
  private readonly workerId: string;
  private readonly retryScheduler?: RetryScheduler;
  private readonly dlqService?: DlqService;
  private readonly notificationRepository?: NotificationRepository;
  private readonly replayExecutionRepository?: ReplayExecutionRepository;
  private readonly deadLetterRepository?: DeadLetterRepository;

  private isRunning = false;
  private isConnected = false;
  private assignedPartitions: Array<{ topic: string; partition: number }> = [];
  private totalProcessed = 0;
  private lastProcessedAt: Date | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly processingService: NotificationProcessingService,
    private readonly eventRepository: NotificationEventRepository,
    options: RetryConsumerOptions = {},
  ) {
    this.groupId = options.groupId || env.kafkaRetryConsumerGroupId;
    this.topic = options.topic || RETRY_TOPIC;
    this.concurrency = options.concurrency ?? env.kafkaRetryConsumerConcurrency;
    this.workerId = options.workerId || `kafka-retry-consumer-${process.pid}`;
    this.retryScheduler = options.retryScheduler;
    this.dlqService = options.dlqService;
    this.notificationRepository = options.notificationRepository;
    this.replayExecutionRepository = options.replayExecutionRepository;
    this.deadLetterRepository = options.deadLetterRepository;

    const kafka = options.kafka || createKafkaInstance();
    this.consumer = kafka.consumer({
      groupId: this.groupId,
      allowAutoTopicCreation: false,
      retry: {
        retries: 5,
        initialRetryTime: 300,
      },
    });

    this.registerConsumerInstrumentation();
  }

  private registerConsumerInstrumentation(): void {
    const { CONNECT, DISCONNECT, GROUP_JOIN, REBALANCING, CRASH } = this.consumer.events;

    this.consumer.on(CONNECT, () => {
      this.isConnected = true;
      logger.info({ groupId: this.groupId }, 'Kafka retry consumer connected to cluster');
    });

    this.consumer.on(DISCONNECT, () => {
      this.isConnected = false;
      logger.info({ groupId: this.groupId }, 'Kafka retry consumer disconnected from cluster');
    });

    this.consumer.on(GROUP_JOIN, (e) => {
      const memberAssignment = e.payload.memberAssignment;
      const assigned: Array<{ topic: string; partition: number }> = [];
      if (memberAssignment) {
        for (const [topic, partitions] of Object.entries(memberAssignment)) {
          for (const p of partitions as number[]) {
            assigned.push({ topic, partition: p });
          }
        }
      }
      this.assignedPartitions = assigned;
      logger.info(
        {
          groupId: this.groupId,
          memberId: e.payload.memberId,
          duration: e.payload.duration,
          assignedPartitions: assigned,
        },
        'Kafka retry consumer joined group and received partition assignment',
      );
    });

    this.consumer.on(REBALANCING, () => {
      logger.info({ groupId: this.groupId }, 'Kafka retry consumer group rebalancing initiated');
    });

    this.consumer.on(CRASH, (e) => {
      this.lastError = e.payload.error.message;
      logger.error(
        { groupId: this.groupId, error: e.payload.error.message },
        'Kafka retry consumer crashed unexpectedly',
      );
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });

      this.isRunning = true;
      logger.info(
        { groupId: this.groupId, topic: this.topic, concurrency: this.concurrency },
        'Starting Kafka retry notification consumer...',
      );

      await this.consumer.run({
        autoCommit: false,
        partitionsConsumedConcurrently: this.concurrency,
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });
    } catch (error) {
      this.isRunning = false;
      this.lastError = (error as Error).message;
      logger.error({ error, groupId: this.groupId }, 'Failed to start Kafka retry consumer');
      throw error;
    }
  }

  async handleMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
    const rawOffset = message.offset;
    const nextOffset = (BigInt(rawOffset) + 1n).toString();

    // 1. Message Validation
    const validationResult = MessageValidator.validate(message);
    if (!validationResult.isValid) {
      logger.warn(
        {
          topic,
          partition,
          offset: rawOffset,
          error: validationResult.error,
        },
        'Received malformed retry message; committing offset to avoid partition stall',
      );
      await this.commitOffsetSafe(topic, partition, nextOffset);
      return;
    }

    const { payload, headers } = validationResult;
    const notificationId = payload.notificationId;
    const currentAttempt = (payload.retryCount || 0) + 1;

    logger.debug(
      {
        topic,
        partition,
        offset: rawOffset,
        eventId: payload.eventId,
        notificationId,
        attempt: currentAttempt,
      },
      'Processing retry notification from Kafka',
    );

    const replayExecution = await this.replayExecutionRepository?.findReplayExecutionByNewNotificationId(
      notificationId,
    );

    try {
      // 2. Emit RETRY_STARTED event
      await this.eventRepository.recordEvent({
        notificationId,
        eventType: EventType.RETRY_STARTED,
        statusBefore: NotificationStatus.RETRY_PENDING,
        statusAfter: NotificationStatus.PROCESSING,
        executionId: payload.eventId,
        metadata: {
          attempt: currentAttempt,
          maxAttempts: env.retryMaxAttempts,
          workerId: this.workerId,
          topic,
          partition,
          offset: rawOffset,
          correlationId: headers['x-correlation-id'],
        },
      });

      // 3. Delegate to application notification processing service
      await this.processingService.processNotification(notificationId, {
        jobId: payload.eventId || `${topic}-${partition}-${rawOffset}`,
        workerId: this.workerId,
        attemptNumber: currentAttempt,
        maxAttempts: env.retryMaxAttempts,
      });

      // 4. Emit REPLAY_COMPLETED and mark ReplayExecution COMPLETED if this was a replayed notification
      if (replayExecution) {
        await this.eventRepository.recordEvent({
          notificationId,
          eventType: EventType.REPLAY_COMPLETED,
          statusBefore: NotificationStatus.DELIVERED,
          statusAfter: NotificationStatus.DELIVERED,
          executionId: payload.eventId,
          metadata: {
            originalNotificationId: replayExecution.originalNotificationId,
            replayId: replayExecution.id,
            workerId: this.workerId,
            topic,
            partition,
            offset: rawOffset,
            correlationId: headers['x-correlation-id'],
          },
        });

        await this.replayExecutionRepository?.updateStatus(replayExecution.id, {
          status: ReplayStatus.COMPLETED,
          completedAt: new Date(),
        });

        if (this.deadLetterRepository) {
          await this.deadLetterRepository.resolveDeadLetter(
            replayExecution.originalNotificationId,
            replayExecution.triggeredBy || undefined,
          );
        }
      }

      // 5. Commit offset upon successful processing
      await this.commitOffsetSafe(topic, partition, nextOffset);

      this.totalProcessed += 1;
      this.lastProcessedAt = new Date();

      logger.info(
        {
          notificationId,
          eventId: payload.eventId,
          topic,
          partition,
          offset: rawOffset,
          attempt: currentAttempt,
        },
        'Successfully processed retried notification and committed offset',
      );
    } catch (processingError) {
      this.lastError = (processingError as Error).message;

      // Classify the failure
      const classification = FailureClassifier.classify(processingError);
      const nextAttempt = currentAttempt + 1;

      // 1. Retryable failure & attempts remain -> Schedule next retry in Redis
      if (classification.isRetryable && nextAttempt <= env.retryMaxAttempts && this.retryScheduler) {
        try {
          const delayMs = BackoffCalculator.calculateDelay(nextAttempt);
          const now = new Date();
          const scheduledFor = new Date(now.getTime() + delayMs).toISOString();

          // Emit RETRY_SCHEDULED event
          await this.eventRepository.recordEvent({
            notificationId,
            eventType: EventType.RETRY_SCHEDULED,
            statusBefore: NotificationStatus.PROCESSING,
            statusAfter: NotificationStatus.RETRY_PENDING,
            executionId: payload.eventId,
            metadata: {
              notificationId,
              originalEventId: payload.eventId,
              attemptNumber: currentAttempt,
              nextAttemptNumber: nextAttempt,
              scheduledAt: now.toISOString(),
              scheduledFor,
              delayMs,
              reason: classification.errorMessage,
              error: classification.errorMessage,
              lastErrorCode: classification.errorCode,
              isRetryable: true,
              workerId: this.workerId,
              topic,
              partition,
              offset: rawOffset,
            },
          });

          // Update status in PostgreSQL
          if (this.notificationRepository) {
            await this.notificationRepository.updateNotificationStatus(
              notificationId,
              NotificationStatus.RETRY_PENDING,
            );
          }

          // Schedule next attempt in Redis ZSET
          await this.retryScheduler.scheduleRetry(
            {
              eventId: payload.eventId,
              eventType: EventType.NOTIFICATION_CREATED,
              notificationId,
              userId: payload.userId,
              templateId: payload.templateId,
              channel: payload.channel,
              category: payload.category,
              priority: payload.priority,
              payload: payload.payload,
              idempotencyKey: payload.idempotencyKey,
              correlationId: (headers['x-correlation-id'] as string) || payload.correlationId,
              timestamp: new Date().toISOString(),
              retryCount: currentAttempt,
              metadata: {
                attemptNumber: currentAttempt,
                nextAttemptNumber: nextAttempt,
                scheduledAt: now.toISOString(),
                scheduledFor,
                delayMs,
                reason: classification.errorMessage,
                error: classification.errorMessage,
                lastErrorCode: classification.errorCode,
              },
            },
            delayMs,
          );

          // Commit current retry message offset
          await this.commitOffsetSafe(topic, partition, nextOffset);
          return;
        } catch (scheduleError) {
          logger.error(
            { error: (scheduleError as Error).message, notificationId },
            'Failed to schedule next retry in Redis; offset left uncommitted for redelivery',
          );
          throw scheduleError;
        }
      }

      // 2. Permanent failure -> Move directly to DLQ
      if (!classification.isRetryable && this.dlqService) {
        try {
          if (replayExecution) {
            await this.replayExecutionRepository?.updateStatus(replayExecution.id, {
              status: ReplayStatus.FAILED,
              errorMessage: classification.errorMessage,
              completedAt: new Date(),
            });
          }

          await this.dlqService.moveToDlq({
            notificationId,
            userId: payload.userId,
            eventId: payload.eventId,
            originalPayload: payload.payload,
            failedAttempts: currentAttempt,
            reason: classification.errorMessage,
            lastErrorCode: classification.errorCode,
            lastErrorMessage: classification.errorMessage,
            errorDetails: classification.errorDetails,
            workerId: this.workerId,
            executionId: payload.eventId,
            correlationId: headers['x-correlation-id'],
            channel: payload.channel,
            category: payload.category,
            priority: payload.priority,
          });

          await this.commitOffsetSafe(topic, partition, nextOffset);
          return;
        } catch (dlqError) {
          logger.error(
            { error: (dlqError as Error).message, notificationId },
            'Failed to transition permanent retry failure to DLQ; offset left uncommitted',
          );
          throw dlqError;
        }
      }

      // 3. Max attempts exhausted (currentAttempt >= maxAttempts) -> Move to DLQ
      if (currentAttempt >= env.retryMaxAttempts && this.dlqService) {
        try {
          if (replayExecution) {
            await this.replayExecutionRepository?.updateStatus(replayExecution.id, {
              status: ReplayStatus.FAILED,
              errorMessage: `Max delivery attempts exhausted (${currentAttempt}/${env.retryMaxAttempts})`,
              completedAt: new Date(),
            });
          }

          await this.dlqService.moveToDlq({
            notificationId,
            userId: payload.userId,
            eventId: payload.eventId,
            originalPayload: payload.payload,
            failedAttempts: currentAttempt,
            reason: `Max delivery attempts exhausted (${currentAttempt}/${env.retryMaxAttempts})`,
            lastErrorCode: classification.errorCode,
            lastErrorMessage: classification.errorMessage,
            errorDetails: classification.errorDetails,
            workerId: this.workerId,
            executionId: payload.eventId,
            correlationId: headers['x-correlation-id'],
            channel: payload.channel,
            category: payload.category,
            priority: payload.priority,
          });

          await this.commitOffsetSafe(topic, partition, nextOffset);
          return;
        } catch (dlqError) {
          logger.error(
            { error: (dlqError as Error).message, notificationId },
            'Failed to transition exhausted notification to DLQ; offset left uncommitted',
          );
          throw dlqError;
        }
      }

      logger.error(
        {
          notificationId,
          eventId: payload.eventId,
          topic,
          partition,
          offset: rawOffset,
          error: (processingError as Error).message,
        },
        'Retry notification processing failed; offset left uncommitted for Kafka redelivery',
      );
      // Rethrow for infrastructure errors so offset remains uncommitted
      throw processingError;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    logger.info({ groupId: this.groupId }, 'Stopping Kafka retry consumer...');
    try {
      await this.consumer.stop();
      await this.consumer.disconnect();
      this.isRunning = false;
      this.isConnected = false;
      logger.info({ groupId: this.groupId }, 'Kafka retry consumer stopped and disconnected');
    } catch (error) {
      logger.warn({ error, groupId: this.groupId }, 'Error while stopping Kafka retry consumer');
    }
  }

  getStatus(): RetryConsumerStatus {
    return {
      isRunning: this.isRunning,
      isConnected: this.isConnected,
      groupId: this.groupId,
      subscribedTopic: this.topic,
      assignedPartitions: [...this.assignedPartitions],
      totalProcessed: this.totalProcessed,
      lastProcessedAt: this.lastProcessedAt,
      lastError: this.lastError,
    };
  }

  private async commitOffsetSafe(topic: string, partition: number, offset: string): Promise<void> {
    try {
      await this.consumer.commitOffsets([{ topic, partition, offset }]);
    } catch (err) {
      if (
        (err as Error).message?.includes('Consumer group was not initialized') ||
        (err as Error).name === 'KafkaJSNonRetriableError'
      ) {
        logger.debug({ topic, partition, offset }, 'Consumer group not initialized; skipped commitOffsets');
        return;
      }
      throw err;
    }
  }
}
