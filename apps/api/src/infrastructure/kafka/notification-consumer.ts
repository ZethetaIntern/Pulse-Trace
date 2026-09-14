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
import { RetryScheduler } from '../../modules/retry/services/retry-scheduler';
import { DlqService } from '../../modules/dlq/services/dlq-service';
import { DeadLetterRepository } from '../../modules/dlq/interfaces/dead-letter-repository';

export const CONSUMABLE_NOTIFICATION_TOPICS = [
  'notifications.high',
  'notifications.normal',
  'notifications.low',
] as const;

export type ConsumableTopic = (typeof CONSUMABLE_NOTIFICATION_TOPICS)[number];

export interface NotificationConsumerOptions {
  groupId?: string;
  concurrency?: number;
  topics?: string[];
  kafka?: Kafka;
  workerId?: string;
  retryScheduler?: RetryScheduler;
  dlqService?: DlqService;
  notificationRepository?: NotificationRepository;
  deadLetterRepository?: DeadLetterRepository;
}

export interface ConsumerStatus {
  isRunning: boolean;
  isConnected: boolean;
  groupId: string;
  subscribedTopics: string[];
  assignedPartitions: Array<{ topic: string; partition: number }>;
  totalProcessed: number;
  lastProcessedAt: Date | null;
  lastError: string | null;
}

export class NotificationConsumer {
  private readonly consumer: Consumer;
  private readonly groupId: string;
  private readonly topics: string[];
  private readonly concurrency: number;
  private readonly workerId: string;
  private readonly retryScheduler?: RetryScheduler;
  private readonly dlqService?: DlqService;
  private readonly notificationRepository?: NotificationRepository;
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
    private readonly replayExecutionRepository: ReplayExecutionRepository,
    options: NotificationConsumerOptions = {},
  ) {
    this.groupId = options.groupId || env.kafkaConsumerGroupId;
    this.topics = options.topics || [...CONSUMABLE_NOTIFICATION_TOPICS];
    this.concurrency = options.concurrency ?? env.kafkaConsumerConcurrency;
    this.workerId = options.workerId || `kafka-consumer-${process.pid}`;
    this.retryScheduler = options.retryScheduler;
    this.dlqService = options.dlqService;
    this.notificationRepository = options.notificationRepository;
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
      logger.info({ groupId: this.groupId }, 'Kafka consumer connected to cluster');
    });

    this.consumer.on(DISCONNECT, () => {
      this.isConnected = false;
      logger.info({ groupId: this.groupId }, 'Kafka consumer disconnected from cluster');
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
        'Kafka consumer joined group and received partition assignment',
      );
    });

    this.consumer.on(REBALANCING, () => {
      logger.info({ groupId: this.groupId }, 'Kafka consumer group rebalancing initiated');
    });

    this.consumer.on(CRASH, (e) => {
      this.lastError = e.payload.error.message;
      logger.error(
        { groupId: this.groupId, error: e.payload.error.message },
        'Kafka consumer crashed unexpectedly',
      );
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      await this.consumer.connect();
      for (const topic of this.topics) {
        await this.consumer.subscribe({ topic, fromBeginning: false });
      }

      this.isRunning = true;
      logger.info(
        { groupId: this.groupId, topics: this.topics, concurrency: this.concurrency },
        'Starting Kafka notification consumer...',
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
      logger.error({ error, groupId: this.groupId }, 'Failed to start Kafka notification consumer');
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
        'Received malformed Kafka message; committing offset to avoid partition stall',
      );
      // Malformed messages cannot be processed; commit offset to prevent poison-pill partition block
      await this.commitOffsetSafe(topic, partition, nextOffset);
      return;
    }

    const { payload, headers } = validationResult;
    const notificationId = payload.notificationId;

    logger.debug(
      {
        topic,
        partition,
        offset: rawOffset,
        eventId: payload.eventId,
        notificationId,
      },
      'Processing notification message from Kafka',
    );

    // 2. Check Replay Execution association (strictly for replayed notifications)
    const replayExecution = await this.replayExecutionRepository.findReplayExecutionByNewNotificationId(
      notificationId,
    );

    try {
      if (replayExecution) {
        await this.replayExecutionRepository.updateStatus(replayExecution.id, {
          status: ReplayStatus.RUNNING,
          startedAt: new Date(),
        });

        await this.eventRepository.recordEvent({
          notificationId,
          eventType: EventType.REPLAY_STARTED,
          statusBefore: NotificationStatus.QUEUED,
          statusAfter: NotificationStatus.PROCESSING,
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
      }

      // 3. Delegate to existing application notification processing service
      await this.processingService.processNotification(notificationId, {
        jobId: payload.eventId || `${topic}-${partition}-${rawOffset}`,
        workerId: this.workerId,
        attemptNumber: (payload.retryCount || 0) + 1,
        maxAttempts: 1,
      });

      // 4. Emit REPLAY_COMPLETED and mark ReplayExecution COMPLETED only upon successful delivery
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

        await this.replayExecutionRepository.updateStatus(replayExecution.id, {
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

      // 5. Commit offset ONLY upon successful notification processing
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
          correlationId: headers['x-correlation-id'],
        },
        'Successfully processed Kafka notification and committed offset',
      );
    } catch (processingError) {
      this.lastError = (processingError as Error).message;

      // Classify the failure
      const classification = FailureClassifier.classify(processingError);
      const currentAttempt = (payload.retryCount || 0) + 1;
      const nextAttempt = currentAttempt + 1;

      // 1. Retryable failure -> Schedule delayed retry in Redis & commit Kafka offset
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

          // Schedule in Redis ZSET
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

          // Commit primary topic offset (partition unblocked)
          await this.commitOffsetSafe(topic, partition, nextOffset);
          return;
        } catch (scheduleError) {
          logger.error(
            { error: (scheduleError as Error).message, notificationId },
            'Failed to schedule retry in Redis; offset left uncommitted for redelivery',
          );
          throw scheduleError;
        }
      }

      // 2. Permanent failure -> Move directly to DLQ & commit Kafka offset
      if (!classification.isRetryable && this.dlqService) {
        try {
          if (replayExecution) {
            await this.replayExecutionRepository.updateStatus(replayExecution.id, {
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
            'Failed to transition permanent failure to DLQ; offset left uncommitted',
          );
          throw dlqError;
        }
      }

      // 3. Max attempts exhausted -> Move directly to DLQ & commit Kafka offset
      if (currentAttempt >= env.retryMaxAttempts && this.dlqService) {
        try {
          if (replayExecution) {
            await this.replayExecutionRepository.updateStatus(replayExecution.id, {
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
        'Notification processing failed; offset left uncommitted for Kafka redelivery',
      );
      // Rethrow to keep offset uncommitted in KafkaJS for infrastructure crashes / tests
      throw processingError;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    logger.info({ groupId: this.groupId }, 'Stopping Kafka notification consumer...');
    try {
      await this.consumer.stop();
      await this.consumer.disconnect();
      this.isRunning = false;
      this.isConnected = false;
      logger.info({ groupId: this.groupId }, 'Kafka notification consumer stopped and disconnected');
    } catch (error) {
      logger.warn({ error, groupId: this.groupId }, 'Error while stopping Kafka consumer');
    }
  }

  getStatus(): ConsumerStatus {
    return {
      isRunning: this.isRunning,
      isConnected: this.isConnected,
      groupId: this.groupId,
      subscribedTopics: [...this.topics],
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
