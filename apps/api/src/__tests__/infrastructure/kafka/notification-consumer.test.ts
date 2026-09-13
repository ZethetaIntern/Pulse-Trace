import { Category, Channel, EventType, Priority } from '@prisma/client';
import { Consumer, EachMessagePayload, Kafka } from 'kafkajs';
import { NotificationConsumer } from '../../../infrastructure/kafka/notification-consumer';
import { NotificationProcessingService } from '../../../modules/notifications/interfaces/notification-processing-service';
import { NotificationEventRepository } from '../../../modules/notifications/interfaces/notification-event-repository';
import { ReplayExecutionRepository } from '../../../modules/replay/interfaces/replay-execution-repository';

describe('NotificationConsumer Unit Tests', () => {
  let mockConsumer: jest.Mocked<Consumer>;
  let mockKafka: jest.Mocked<Kafka>;
  let mockProcessingService: jest.Mocked<NotificationProcessingService>;
  let mockEventRepository: jest.Mocked<NotificationEventRepository>;
  let mockReplayRepository: jest.Mocked<ReplayExecutionRepository>;
  let consumer: NotificationConsumer;

  const validPayload = {
    eventId: 'evt-101',
    eventType: EventType.NOTIFICATION_CREATED,
    notificationId: 'notif-101',
    userId: 'user-101',
    templateId: 'tpl-101',
    channel: Channel.EMAIL,
    category: Category.TRANSACTIONAL,
    priority: Priority.HIGH,
    payload: { name: 'Bob' },
    idempotencyKey: 'idemp-101',
    correlationId: 'req-corr-101',
    timestamp: new Date().toISOString(),
    retryCount: 0,
    metadata: {},
  };

  beforeEach(() => {
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
    } as unknown as jest.Mocked<Consumer>;

    mockKafka = {
      consumer: jest.fn().mockReturnValue(mockConsumer),
    } as unknown as jest.Mocked<Kafka>;

    mockProcessingService = {
      processNotification: jest.fn().mockResolvedValue(undefined),
    };

    mockEventRepository = {
      recordEvent: jest.fn().mockResolvedValue({} as any),
      listEventsByNotificationId: jest.fn().mockResolvedValue([]),
    };

    mockReplayRepository = {
      findReplayExecutionByNewNotificationId: jest.fn().mockResolvedValue(null),
      createReplayExecution: jest.fn(),
      updateNewNotificationId: jest.fn(),
      findById: jest.fn(),
      findByOriginalNotificationId: jest.fn(),
    };

    consumer = new NotificationConsumer(
      mockProcessingService,
      mockEventRepository,
      mockReplayRepository,
      {
        kafka: mockKafka,
        groupId: 'test-notification-group',
        workerId: 'test-worker-1',
      },
    );
  });

  it('should subscribe to priority topics and start Kafka consumer', async () => {
    await consumer.start();

    expect(mockConsumer.connect).toHaveBeenCalledTimes(1);
    expect(mockConsumer.subscribe).toHaveBeenCalledWith({
      topic: 'notifications.high',
      fromBeginning: false,
    });
    expect(mockConsumer.subscribe).toHaveBeenCalledWith({
      topic: 'notifications.normal',
      fromBeginning: false,
    });
    expect(mockConsumer.subscribe).toHaveBeenCalledWith({
      topic: 'notifications.low',
      fromBeginning: false,
    });
    expect(mockConsumer.run).toHaveBeenCalledWith(
      expect.objectContaining({
        autoCommit: false,
      }),
    );
    expect(consumer.getStatus().isRunning).toBe(true);
  });

  it('should process a valid normal notification and commit offset upon success without replay events', async () => {
    const payload: EachMessagePayload = {
      topic: 'notifications.high',
      partition: 2,
      message: {
        key: Buffer.from('user-101'),
        value: Buffer.from(JSON.stringify(validPayload)),
        offset: '15',
        timestamp: '1789230000000',
        attributes: 0,
        headers: {
          'x-event-id': Buffer.from('evt-101'),
          'x-event-type': Buffer.from('NOTIFICATION_CREATED'),
          'x-correlation-id': Buffer.from('req-corr-101'),
        },
      },
      heartbeat: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn(),
    };

    await consumer.handleMessage(payload);

    expect(mockReplayRepository.findReplayExecutionByNewNotificationId).toHaveBeenCalledWith('notif-101');
    expect(mockEventRepository.recordEvent).not.toHaveBeenCalled(); // No replay events for normal notification
    expect(mockProcessingService.processNotification).toHaveBeenCalledWith('notif-101', {
      jobId: 'evt-101',
      workerId: 'test-worker-1',
      attemptNumber: 1,
      maxAttempts: 1,
    });
    expect(mockConsumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 'notifications.high', partition: 2, offset: '16' },
    ]);
    expect(consumer.getStatus().totalProcessed).toBe(1);
  });

  it('should emit REPLAY_STARTED and REPLAY_COMPLETED when message is linked to a replay execution', async () => {
    mockReplayRepository.findReplayExecutionByNewNotificationId.mockResolvedValueOnce({
      id: 'replay-exec-99',
      originalNotificationId: 'original-notif-1',
      newNotificationId: 'notif-101',
      reason: 'Network failure rerun',
      triggeredBy: 'admin',
      createdAt: new Date(),
    });

    const payload: EachMessagePayload = {
      topic: 'notifications.normal',
      partition: 0,
      message: {
        key: Buffer.from('user-101'),
        value: Buffer.from(JSON.stringify(validPayload)),
        offset: '20',
        timestamp: '1789230000000',
        attributes: 0,
        headers: {},
      },
      heartbeat: jest.fn(),
      pause: jest.fn(),
    };

    await consumer.handleMessage(payload);

    expect(mockEventRepository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: 'notif-101',
        eventType: EventType.REPLAY_STARTED,
      }),
    );
    expect(mockProcessingService.processNotification).toHaveBeenCalledTimes(1);
    expect(mockEventRepository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: 'notif-101',
        eventType: EventType.REPLAY_COMPLETED,
      }),
    );
    expect(mockConsumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 'notifications.normal', partition: 0, offset: '21' },
    ]);
  });

  it('should not commit offset when notification processing fails', async () => {
    mockProcessingService.processNotification.mockRejectedValueOnce(
      new Error('Provider temporary timeout'),
    );

    const payload: EachMessagePayload = {
      topic: 'notifications.high',
      partition: 1,
      message: {
        key: Buffer.from('user-101'),
        value: Buffer.from(JSON.stringify(validPayload)),
        offset: '50',
        timestamp: '1789230000000',
        attributes: 0,
        headers: {},
      },
      heartbeat: jest.fn(),
      pause: jest.fn(),
    };

    await expect(consumer.handleMessage(payload)).rejects.toThrow('Provider temporary timeout');

    expect(mockConsumer.commitOffsets).not.toHaveBeenCalled();
    expect(consumer.getStatus().lastError).toBe('Provider temporary timeout');
  });

  it('should commit offset for malformed message without crashing the consumer', async () => {
    const malformedPayload: EachMessagePayload = {
      topic: 'notifications.low',
      partition: 3,
      message: {
        key: Buffer.from('user-bad'),
        value: Buffer.from('NOT_A_JSON_STRING'),
        offset: '99',
        timestamp: '1789230000000',
        attributes: 0,
        headers: {},
      },
      heartbeat: jest.fn(),
      pause: jest.fn(),
    };

    await consumer.handleMessage(malformedPayload);

    expect(mockProcessingService.processNotification).not.toHaveBeenCalled();
    expect(mockConsumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 'notifications.low', partition: 3, offset: '100' },
    ]);
  });

  it('should stop consumer cleanly', async () => {
    await consumer.start();
    await consumer.stop();

    expect(mockConsumer.stop).toHaveBeenCalledTimes(1);
    expect(mockConsumer.disconnect).toHaveBeenCalledTimes(1);
    expect(consumer.getStatus().isRunning).toBe(false);
  });
});
