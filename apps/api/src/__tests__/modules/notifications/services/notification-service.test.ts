import {
  EventType,
  Notification,
  NotificationEvent,
  NotificationStatus,
  Channel,
  Category,
  Priority,
  Template,
  User,
} from '@prisma/client';
import { NotificationService } from '../../../../modules/notifications/services/notification-service';
import { NotificationRepository } from '../../../../modules/notifications/interfaces/notification-repository';
import { NotificationEventRepository } from '../../../../modules/notifications/interfaces/notification-event-repository';
import { QueueService } from '../../../../modules/notifications/interfaces/queue-service';
import { HttpError } from '../../../../shared/errors/http-error';
import { CreateNotificationDto } from '../../../../modules/notifications/dto/create-notification.dto';
import { ListNotificationsQuery } from '../../../../modules/notifications/dto/list-notifications-query';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UUID = '550e8400-e29b-41d4-a716-446655440000';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: UUID,
    userId: UUID,
    templateId: UUID,
    channel: Channel.EMAIL,
    category: Category.TRANSACTIONAL,
    priority: Priority.NORMAL,
    status: NotificationStatus.CREATED,
    payload: {},
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeUser(): User {
  return {
    id: UUID,
    email: 'test@test.com',
    name: 'Test',
    phone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeTemplate(channel: Channel = Channel.EMAIL): Template {
  return {
    id: UUID,
    name: 'Test',
    channel,
    subject: 'Sub',
    body: 'Body',
    version: 1,
    status: 'PUBLISHED',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    id: 'event-1',
    notificationId: UUID,
    eventType: EventType.NOTIFICATION_CREATED,
    statusBefore: null,
    statusAfter: NotificationStatus.CREATED,
    executionId: null,
    metadata: {},
    occurredAt: new Date(),
    ...overrides,
  };
}

interface MockMocks {
  repository: jest.Mocked<NotificationRepository>;
  eventRepository: jest.Mocked<NotificationEventRepository>;
  queue: jest.Mocked<QueueService>;
}

function createMocks(): MockMocks {
  return {
    repository: {
      createNotification: jest.fn(),
      findNotificationById: jest.fn(),
      updateNotificationStatus: jest.fn(),
      listNotifications: jest.fn(),
      findUserById: jest.fn(),
      findTemplateById: jest.fn(),
    } as jest.Mocked<NotificationRepository>,
    eventRepository: {
      recordEvent: jest.fn().mockResolvedValue(makeEvent()),
      listEventsByNotificationId: jest.fn().mockResolvedValue([]),
    } as jest.Mocked<NotificationEventRepository>,
    queue: {
      addNotificationJob: jest.fn().mockResolvedValue('job-1'),
    } as jest.Mocked<QueueService>,
  };
}

function validDto(): CreateNotificationDto {
  return {
    userId: UUID,
    templateId: UUID,
    channel: Channel.EMAIL,
    category: Category.TRANSACTIONAL,
    priority: Priority.NORMAL,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationService', () => {
  describe('createNotification', () => {
    it('creates a notification successfully', async () => {
      const mocks = createMocks();
      mocks.repository.findUserById.mockResolvedValue(makeUser());
      mocks.repository.findTemplateById.mockResolvedValue(makeTemplate());
      mocks.repository.createNotification.mockResolvedValue(makeNotification());
      mocks.repository.updateNotificationStatus.mockResolvedValue(makeNotification({ status: NotificationStatus.QUEUED }));

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);
      const result = await service.createNotification(validDto());

      expect(result).toBeDefined();
      expect(mocks.repository.findUserById).toHaveBeenCalledWith(UUID);
      expect(mocks.repository.findTemplateById).toHaveBeenCalledWith(UUID);
      expect(mocks.repository.createNotification).toHaveBeenCalled();
      expect(mocks.queue.addNotificationJob).toHaveBeenCalled();
      // Should record 3 creation events + 1 JOB_QUEUED event
      expect(mocks.eventRepository.recordEvent).toHaveBeenCalledTimes(4);
    });

    it('throws USER_NOT_FOUND when user does not exist', async () => {
      const mocks = createMocks();
      mocks.repository.findUserById.mockResolvedValue(null);

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);

      await expect(service.createNotification(validDto())).rejects.toThrow(HttpError);
      try {
        await service.createNotification(validDto());
      } catch (error) {
        expect((error as HttpError).code).toBe('USER_NOT_FOUND');
      }
    });

    it('throws TEMPLATE_NOT_FOUND when template does not exist', async () => {
      const mocks = createMocks();
      mocks.repository.findUserById.mockResolvedValue(makeUser());
      mocks.repository.findTemplateById.mockResolvedValue(null);

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);

      await expect(service.createNotification(validDto())).rejects.toThrow(HttpError);
      try {
        await service.createNotification(validDto());
      } catch (error) {
        expect((error as HttpError).code).toBe('TEMPLATE_NOT_FOUND');
      }
    });

    it('throws TEMPLATE_CHANNEL_MISMATCH on channel mismatch', async () => {
      const mocks = createMocks();
      mocks.repository.findUserById.mockResolvedValue(makeUser());
      mocks.repository.findTemplateById.mockResolvedValue(makeTemplate(Channel.SMS));

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);

      await expect(service.createNotification(validDto())).rejects.toThrow(HttpError);
      try {
        await service.createNotification(validDto());
      } catch (error) {
        expect((error as HttpError).code).toBe('TEMPLATE_CHANNEL_MISMATCH');
      }
    });

    it('throws QUEUE_UNAVAILABLE when enqueue fails', async () => {
      const mocks = createMocks();
      mocks.repository.findUserById.mockResolvedValue(makeUser());
      mocks.repository.findTemplateById.mockResolvedValue(makeTemplate());
      mocks.repository.createNotification.mockResolvedValue(makeNotification());
      mocks.repository.updateNotificationStatus.mockResolvedValue(makeNotification({ status: NotificationStatus.QUEUED }));
      mocks.queue.addNotificationJob.mockRejectedValue(new Error('Redis down'));

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);

      await expect(service.createNotification(validDto())).rejects.toThrow(HttpError);
      try {
        await service.createNotification(validDto());
      } catch (error) {
        expect((error as HttpError).code).toBe('QUEUE_UNAVAILABLE');
      }
      // Should record DELIVERY_FAILED event on enqueue failure
      expect(mocks.eventRepository.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.DELIVERY_FAILED }),
      );
    });

    it('transitions status to QUEUED before enqueueing', async () => {
      const mocks = createMocks();
      mocks.repository.findUserById.mockResolvedValue(makeUser());
      mocks.repository.findTemplateById.mockResolvedValue(makeTemplate());
      mocks.repository.createNotification.mockResolvedValue(makeNotification());
      mocks.repository.updateNotificationStatus.mockResolvedValue(makeNotification({ status: NotificationStatus.QUEUED }));

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);
      await service.createNotification(validDto());

      // First call: QUEUED (before enqueue)
      const calls = mocks.repository.updateNotificationStatus.mock.calls;
      expect(calls[0][1]).toBe(NotificationStatus.QUEUED);
    });
  });

  describe('getNotificationById', () => {
    it('returns a notification when found', async () => {
      const mocks = createMocks();
      const notification = makeNotification();
      mocks.repository.findNotificationById.mockResolvedValue(notification);

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);
      const result = await service.getNotificationById(UUID);

      expect(result).toEqual(notification);
    });

    it('throws NOT_FOUND when notification does not exist', async () => {
      const mocks = createMocks();
      mocks.repository.findNotificationById.mockResolvedValue(null);

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);

      await expect(service.getNotificationById(UUID)).rejects.toThrow(HttpError);
      try {
        await service.getNotificationById(UUID);
      } catch (error) {
        expect((error as HttpError).code).toBe('NOT_FOUND');
      }
    });
  });

  describe('listNotifications', () => {
    it('returns paginated results', async () => {
      const mocks = createMocks();
      const items = [makeNotification(), makeNotification({ id: 'other-id' })];
      mocks.repository.listNotifications.mockResolvedValue({ items, total: 2 });

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);
      const query: ListNotificationsQuery = {
        page: 1, limit: 20, sort: 'createdAt', order: 'desc',
      };
      const result = await service.listNotifications(query);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mocks.repository.listNotifications).toHaveBeenCalledWith(query);
    });
  });

  describe('getNotificationTimeline', () => {
    it('returns events for an existing notification', async () => {
      const mocks = createMocks();
      const events = [makeEvent(), makeEvent({ id: 'event-2' })];
      mocks.repository.findNotificationById.mockResolvedValue(makeNotification());
      mocks.eventRepository.listEventsByNotificationId.mockResolvedValue(events);

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);
      const result = await service.getNotificationTimeline(UUID);

      expect(result).toHaveLength(2);
      expect(mocks.eventRepository.listEventsByNotificationId).toHaveBeenCalledWith(UUID);
    });

    it('throws NOT_FOUND for non-existent notification', async () => {
      const mocks = createMocks();
      mocks.repository.findNotificationById.mockResolvedValue(null);

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);

      await expect(service.getNotificationTimeline(UUID)).rejects.toThrow(HttpError);
    });
  });

  describe('processNotification', () => {
    const context = {
      jobId: 'job-1',
      workerId: 'worker-1',
      attemptNumber: 1,
      maxAttempts: 3,
    };

    it('processes notification successfully', async () => {
      const mocks = createMocks();
      mocks.repository.findNotificationById.mockResolvedValue(makeNotification());
      mocks.repository.updateNotificationStatus.mockResolvedValue(makeNotification());

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);
      await service.processNotification(UUID, context);

      // Should update status to PROCESSING then DELIVERED
      expect(mocks.repository.updateNotificationStatus).toHaveBeenCalledTimes(2);
      expect(mocks.repository.updateNotificationStatus).toHaveBeenCalledWith(UUID, NotificationStatus.PROCESSING);
      expect(mocks.repository.updateNotificationStatus).toHaveBeenCalledWith(UUID, NotificationStatus.DELIVERED);
      // Should record WORKER_STARTED and WORKER_COMPLETED events
      expect(mocks.eventRepository.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.WORKER_STARTED }),
      );
      expect(mocks.eventRepository.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.WORKER_COMPLETED }),
      );
    });

    it('records RETRY_STARTED for retry attempts', async () => {
      const mocks = createMocks();
      mocks.repository.findNotificationById.mockResolvedValue(makeNotification());
      mocks.repository.updateNotificationStatus.mockResolvedValue(makeNotification());

      const retryContext = { ...context, attemptNumber: 2 };
      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);
      await service.processNotification(UUID, retryContext);

      expect(mocks.eventRepository.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.RETRY_STARTED }),
      );
    });

    it('marks notification FAILED on processing error', async () => {
      const mocks = createMocks();
      mocks.repository.findNotificationById.mockResolvedValue(makeNotification());
      // First call (PROCESSING) succeeds, second call (DELIVERED) fails
      mocks.repository.updateNotificationStatus
        .mockResolvedValueOnce(makeNotification())
        .mockRejectedValueOnce(new Error('DB error'));

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);

      await expect(service.processNotification(UUID, context)).rejects.toThrow();

      // Should record DELIVERY_FAILED event
      expect(mocks.eventRepository.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.DELIVERY_FAILED }),
      );
    });

    it('records RETRY_SCHEDULED when retries remain', async () => {
      const mocks = createMocks();
      mocks.repository.findNotificationById.mockResolvedValue(makeNotification());
      mocks.repository.updateNotificationStatus
        .mockResolvedValueOnce(makeNotification())
        .mockRejectedValueOnce(new Error('DB error'));

      const retryContext = { ...context, attemptNumber: 1, maxAttempts: 3 };
      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);

      await expect(service.processNotification(UUID, retryContext)).rejects.toThrow();

      expect(mocks.eventRepository.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.RETRY_SCHEDULED }),
      );
    });

    it('does NOT record RETRY_SCHEDULED when retries exhausted', async () => {
      const mocks = createMocks();
      mocks.repository.findNotificationById.mockResolvedValue(makeNotification());
      mocks.repository.updateNotificationStatus
        .mockResolvedValueOnce(makeNotification())
        .mockRejectedValueOnce(new Error('DB error'));

      const exhaustedContext = { ...context, attemptNumber: 3, maxAttempts: 3 };
      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);

      await expect(service.processNotification(UUID, exhaustedContext)).rejects.toThrow();

      const retryScheduledCalls = mocks.eventRepository.recordEvent.mock.calls.filter(
        (call) => call[0].eventType === EventType.RETRY_SCHEDULED,
      );
      expect(retryScheduledCalls).toHaveLength(0);
    });

    it('throws when notification not found', async () => {
      const mocks = createMocks();
      mocks.repository.findNotificationById.mockResolvedValue(null);

      const service = new NotificationService(mocks.repository, mocks.eventRepository, mocks.queue);

      await expect(service.processNotification(UUID, context)).rejects.toThrow(
        `Notification ${UUID} not found while processing queued job`,
      );
    });
  });
});
