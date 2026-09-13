import { EachMessagePayload } from 'kafkajs';
import { Channel, Category, Priority, EventType, NotificationStatus } from '@prisma/client';
import { RetryConsumer } from '../../../infrastructure/kafka/retry-consumer';
import { NotificationProcessingService } from '../../../modules/notifications/interfaces/notification-processing-service';
import { NotificationEventRepository } from '../../../modules/notifications/interfaces/notification-event-repository';
import { NotificationRepository } from '../../../modules/notifications/interfaces/notification-repository';
import { RetryScheduler } from '../../../modules/retry/services/retry-scheduler';
import { DlqService } from '../../../modules/dlq/services/dlq-service';
import { HttpError } from '../../../shared/errors/http-error';

describe('RetryConsumer Unit Tests', () => {
  let mockProcessingService: jest.Mocked<NotificationProcessingService>;
  let mockEventRepo: jest.Mocked<NotificationEventRepository>;
  let mockNotificationRepo: jest.Mocked<NotificationRepository>;
  let mockRetryScheduler: jest.Mocked<RetryScheduler>;
  let mockDlqService: jest.Mocked<DlqService>;
  let mockKafka: any;
  let mockConsumer: any;
  let consumer: RetryConsumer;

  const validRetryPayload = {
    eventId: 'evt-retry-101',
    eventType: EventType.NOTIFICATION_CREATED,
    notificationId: 'notif-retry-101',
    userId: 'user-101',
    templateId: 'tmpl-101',
    channel: Channel.EMAIL,
    category: Category.TRANSACTIONAL,
    priority: Priority.HIGH,
    payload: { code: '9999' },
    idempotencyKey: 'idemp-101',
    correlationId: 'req-corr-101',
    timestamp: new Date().toISOString(),
    retryCount: 1, // 1st retry -> attempt 2
    metadata: {
      attemptNumber: 1,
      nextAttemptNumber: 2,
    },
  };

  beforeEach(() => {
    mockProcessingService = {
      processNotification: jest.fn().mockResolvedValue(undefined),
    };

    mockEventRepo = {
      recordEvent: jest.fn().mockResolvedValue({} as any),
      listEventsByNotificationId: jest.fn().mockResolvedValue([]),
    };

    mockNotificationRepo = {
      findNotificationById: jest.fn(),
      findUserById: jest.fn(),
      findTemplateById: jest.fn(),
      createNotification: jest.fn(),
      updateNotificationStatus: jest.fn().mockResolvedValue({} as any),
      listNotifications: jest.fn(),
    };

    mockRetryScheduler = {
      scheduleRetry: jest.fn().mockResolvedValue(Date.now() + 2000),
      claimDueRetries: jest.fn(),
      acknowledgeRetry: jest.fn(),
      pollAndPublishDueRetries: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      getQueueDepth: jest.fn(),
    } as any;

    mockDlqService = {
      moveToDlq: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockConsumer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      commitOffsets: jest.fn().mockResolvedValue(undefined),
      events: {
        CONNECT: 'consumer.connect',
        DISCONNECT: 'consumer.disconnect',
        GROUP_JOIN: 'consumer.group_join',
        REBALANCING: 'consumer.rebalancing',
        CRASH: 'consumer.crash',
      },
      on: jest.fn(),
    };

    mockKafka = {
      consumer: jest.fn().mockReturnValue(mockConsumer),
    };

    consumer = new RetryConsumer(
      mockProcessingService,
      mockEventRepo,
      {
        kafka: mockKafka,
        retryScheduler: mockRetryScheduler,
        dlqService: mockDlqService,
        notificationRepository: mockNotificationRepo,
      },
    );
  });

  it('should process a valid retry message successfully, emit RETRY_STARTED, and commit offset', async () => {
    const rawMessage: EachMessagePayload = {
      topic: 'notifications.retry',
      partition: 0,
      message: {
        key: Buffer.from('user-101'),
        value: Buffer.from(JSON.stringify(validRetryPayload)),
        offset: '50',
        timestamp: '1789230000000',
        attributes: 0,
        headers: {
          'x-event-id': Buffer.from('evt-retry-101'),
          'x-correlation-id': Buffer.from('req-corr-101'),
        },
      },
      heartbeat: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn(),
    };

    await consumer.handleMessage(rawMessage);

    // 1. Verify RETRY_STARTED event emitted
    expect(mockEventRepo.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: validRetryPayload.notificationId,
        eventType: EventType.RETRY_STARTED,
        statusBefore: NotificationStatus.RETRY_PENDING,
        statusAfter: NotificationStatus.PROCESSING,
        metadata: expect.objectContaining({
          attempt: 2,
        }),
      }),
    );

    // 2. Verify delivery processing invoked with attempt 2
    expect(mockProcessingService.processNotification).toHaveBeenCalledWith(
      validRetryPayload.notificationId,
      expect.objectContaining({
        attemptNumber: 2,
      }),
    );

    // 3. Verify offset committed (50 + 1 = 51)
    expect(mockConsumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 'notifications.retry', partition: 0, offset: '51' },
    ]);
    expect(consumer.getStatus().totalProcessed).toBe(1);
  });

  it('on transient retry failure (attempt 2 < 5), should schedule next retry and commit offset', async () => {
    const transientErr = new HttpError('503 Service Unavailable', 503, 'SERVICE_UNAVAILABLE');
    mockProcessingService.processNotification.mockRejectedValueOnce(transientErr);

    const rawMessage: EachMessagePayload = {
      topic: 'notifications.retry',
      partition: 0,
      message: {
        key: Buffer.from('user-101'),
        value: Buffer.from(JSON.stringify(validRetryPayload)), // retryCount = 1 -> attempt 2
        offset: '50',
        timestamp: '1789230000000',
        attributes: 0,
        headers: {},
      },
      heartbeat: jest.fn(),
      pause: jest.fn(),
    };

    await consumer.handleMessage(rawMessage);

    // Verify RETRY_SCHEDULED event
    expect(mockEventRepo.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: EventType.RETRY_SCHEDULED,
        metadata: expect.objectContaining({
          attemptNumber: 2,
          nextAttemptNumber: 3,
        }),
      }),
    );

    // Verify next retry scheduled in Redis
    expect(mockRetryScheduler.scheduleRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        retryCount: 2,
      }),
      expect.any(Number),
    );

    // Verify offset committed
    expect(mockConsumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 'notifications.retry', partition: 0, offset: '51' },
    ]);
  });

  it('on max attempts reached (attempt 5 fails), should transition to DLQ and commit offset', async () => {
    const exhaustedPayload = {
      ...validRetryPayload,
      retryCount: 4, // 4 prior retries -> current attempt = 5
    };

    const transientErr = new HttpError('500 Internal Error', 500, 'SERVER_ERROR');
    mockProcessingService.processNotification.mockRejectedValueOnce(transientErr);

    const rawMessage: EachMessagePayload = {
      topic: 'notifications.retry',
      partition: 0,
      message: {
        key: Buffer.from('user-101'),
        value: Buffer.from(JSON.stringify(exhaustedPayload)),
        offset: '80',
        timestamp: '1789230000000',
        attributes: 0,
        headers: {},
      },
      heartbeat: jest.fn(),
      pause: jest.fn(),
    };

    await consumer.handleMessage(rawMessage);

    // Verify moved to DLQ
    expect(mockDlqService.moveToDlq).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: exhaustedPayload.notificationId,
        failedAttempts: 5,
      }),
    );

    // Verify offset committed
    expect(mockConsumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 'notifications.retry', partition: 0, offset: '81' },
    ]);
  });

  it('on permanent failure (e.g. 400 Bad Request), should transition to DLQ immediately and commit offset', async () => {
    const permanentErr = new HttpError('Invalid payload', 400, 'BAD_REQUEST');
    mockProcessingService.processNotification.mockRejectedValueOnce(permanentErr);

    const rawMessage: EachMessagePayload = {
      topic: 'notifications.retry',
      partition: 0,
      message: {
        key: Buffer.from('user-101'),
        value: Buffer.from(JSON.stringify(validRetryPayload)),
        offset: '60',
        timestamp: '1789230000000',
        attributes: 0,
        headers: {},
      },
      heartbeat: jest.fn(),
      pause: jest.fn(),
    };

    await consumer.handleMessage(rawMessage);

    // Verify moved directly to DLQ
    expect(mockDlqService.moveToDlq).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: validRetryPayload.notificationId,
        failedAttempts: 2,
        lastErrorCode: 'BAD_REQUEST',
      }),
    );

    // Verify offset committed
    expect(mockConsumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 'notifications.retry', partition: 0, offset: '61' },
    ]);
  });

  it('should commit offset for malformed retry message without crashing', async () => {
    const rawMessage: EachMessagePayload = {
      topic: 'notifications.retry',
      partition: 0,
      message: {
        key: Buffer.from('user-101'),
        value: Buffer.from('{ malformed json'),
        offset: '99',
        timestamp: '1789230000000',
        attributes: 0,
        headers: {},
      },
      heartbeat: jest.fn(),
      pause: jest.fn(),
    };

    await consumer.handleMessage(rawMessage);

    expect(mockProcessingService.processNotification).not.toHaveBeenCalled();
    expect(mockConsumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 'notifications.retry', partition: 0, offset: '100' },
    ]);
  });
});
