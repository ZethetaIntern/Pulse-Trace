import { EventType, NotificationStatus } from '@prisma/client';
import { DlqService, DLQ_TOPIC } from '../../../../modules/dlq/services/dlq-service';
import { DeadLetterRepository } from '../../../../modules/dlq/interfaces/dead-letter-repository';
import { NotificationRepository } from '../../../../modules/notifications/interfaces/notification-repository';
import { NotificationEventRepository } from '../../../../modules/notifications/interfaces/notification-event-repository';
import { OutboxPublisherSink } from '../../../../modules/outbox/interfaces/outbox-publisher-sink';

describe('DlqService Unit Tests', () => {
  let mockDeadLetterRepo: jest.Mocked<DeadLetterRepository>;
  let mockNotificationRepo: jest.Mocked<NotificationRepository>;
  let mockEventRepo: jest.Mocked<NotificationEventRepository>;
  let mockSink: jest.Mocked<OutboxPublisherSink>;
  let dlqService: DlqService;

  beforeEach(() => {
    mockDeadLetterRepo = {
      createDeadLetter: jest.fn().mockResolvedValue({} as any),
      findDeadLetterByNotificationId: jest.fn().mockResolvedValue(null),
      resolveDeadLetter: jest.fn().mockResolvedValue(null),
      countDeadLetters: jest.fn().mockResolvedValue(0),
    };

    mockNotificationRepo = {
      findNotificationById: jest.fn(),
      findUserById: jest.fn(),
      findTemplateById: jest.fn(),
      createNotification: jest.fn(),
      updateNotificationStatus: jest.fn().mockResolvedValue({} as any),
      listNotifications: jest.fn(),
    };

    mockEventRepo = {
      recordEvent: jest.fn().mockResolvedValue({} as any),
      listEventsByNotificationId: jest.fn().mockResolvedValue([]),
    };

    mockSink = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    dlqService = new DlqService(
      mockDeadLetterRepo,
      mockNotificationRepo,
      mockEventRepo,
      mockSink,
    );
  });

  it('should persist dead letter, update status to DLQ, emit DLQ_MOVED event, and publish to notifications.dlq', async () => {
    const input = {
      notificationId: 'notif-dlq-1',
      userId: 'user-dlq-1',
      eventId: 'evt-dlq-1',
      originalPayload: { amount: 100 },
      failedAttempts: 5,
      reason: 'Max delivery attempts exhausted (5/5)',
      lastErrorCode: 'PROVIDER_TIMEOUT',
      lastErrorMessage: 'Request timeout after 5000ms',
      workerId: 'worker-node-1',
      correlationId: 'req-corr-dlq',
      channel: 'EMAIL',
      category: 'TRANSACTIONAL',
      priority: 'HIGH',
    };

    await dlqService.moveToDlq(input);

    // 1. Verify DB DeadLetter record
    expect(mockDeadLetterRepo.createDeadLetter).toHaveBeenCalledWith({
      notificationId: input.notificationId,
      originalPayload: input.originalPayload,
      failedAttempts: 5,
      lastErrorCode: 'PROVIDER_TIMEOUT',
      lastErrorMessage: 'Request timeout after 5000ms',
      errorDetails: [],
    });

    // 2. Verify Notification status update
    expect(mockNotificationRepo.updateNotificationStatus).toHaveBeenCalledWith(
      input.notificationId,
      NotificationStatus.DLQ,
    );

    // 3. Verify DLQ_MOVED event
    expect(mockEventRepo.recordEvent).toHaveBeenCalledWith({
      notificationId: input.notificationId,
      eventType: EventType.DLQ_MOVED,
      statusBefore: NotificationStatus.PROCESSING,
      statusAfter: NotificationStatus.DLQ,
      executionId: input.eventId,
      metadata: expect.objectContaining({
        failedAttempts: 5,
        reason: input.reason,
        errorCode: 'PROVIDER_TIMEOUT',
      }),
    });

    // 4. Verify Kafka publication to notifications.dlq
    expect(mockSink.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: input.eventId,
        topic: DLQ_TOPIC,
        partitionKey: input.userId,
      }),
    );
  });

  it('should not throw if Kafka publish fails, preserving durable DB record', async () => {
    mockSink.publish.mockRejectedValueOnce(new Error('Kafka broker unavailable'));

    const input = {
      notificationId: 'notif-dlq-2',
      userId: 'user-dlq-2',
      eventId: 'evt-dlq-2',
      originalPayload: { amount: 200 },
      failedAttempts: 1,
      reason: 'Invalid email address',
      lastErrorCode: 'INVALID_RECIPIENT',
      lastErrorMessage: 'Recipient does not exist',
    };

    await expect(dlqService.moveToDlq(input)).resolves.not.toThrow();

    expect(mockDeadLetterRepo.createDeadLetter).toHaveBeenCalled();
    expect(mockNotificationRepo.updateNotificationStatus).toHaveBeenCalledWith(
      input.notificationId,
      NotificationStatus.DLQ,
    );
  });
});
