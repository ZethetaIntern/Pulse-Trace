import {
  NotificationStatus,
  Notification,
  NotificationEvent,
  ReplayExecution,
  Channel,
  Category,
  Priority,
  EventType,
} from '@prisma/client';
import { ReplayService } from '../../../../modules/replay/services/replay-service';
import { NotificationRepository } from '../../../../modules/notifications/interfaces/notification-repository';
import { NotificationEventRepository } from '../../../../modules/notifications/interfaces/notification-event-repository';
import { QueueService } from '../../../../modules/notifications/interfaces/queue-service';
import { ReplayExecutionRepository } from '../../../../modules/replay/interfaces/replay-execution-repository';
import { HttpError } from '../../../../shared/errors/http-error';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NEW_UUID = '660e8400-e29b-41d4-a716-446655440001';

function makeNotification(status: NotificationStatus = NotificationStatus.DELIVERED): Notification {
  return {
    id: UUID,
    userId: UUID,
    templateId: UUID,
    channel: Channel.EMAIL,
    category: Category.TRANSACTIONAL,
    priority: Priority.NORMAL,
    status,
    payload: { name: 'Alice' },
    metadata: { source: 'test' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeNewNotification(): Notification {
  return { ...makeNotification(), id: NEW_UUID, status: NotificationStatus.CREATED };
}

function makeReplayExecution(): ReplayExecution {
  return {
    id: 'replay-1',
    originalNotificationId: UUID,
    newNotificationId: NEW_UUID,
    reason: 'Test replay',
    triggeredBy: 'api',
    createdAt: new Date(),
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
  notificationRepository: jest.Mocked<NotificationRepository>;
  eventRepository: jest.Mocked<NotificationEventRepository>;
  queue: jest.Mocked<QueueService>;
  replayExecutionRepository: jest.Mocked<ReplayExecutionRepository>;
}

function createMocks(): MockMocks {
  return {
    notificationRepository: {
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
    replayExecutionRepository: {
      createReplayExecution: jest.fn(),
      updateNewNotificationId: jest.fn(),
      findById: jest.fn(),
      findByOriginalNotificationId: jest.fn(),
      findReplayExecutionByNewNotificationId: jest.fn(),
    } as jest.Mocked<ReplayExecutionRepository>,
  };
}

describe('ReplayService', () => {
  describe('replayNotification', () => {
    it('replays a notification successfully', async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById
        .mockResolvedValueOnce(makeNotification())
        .mockResolvedValueOnce(makeNewNotification());
      mocks.notificationRepository.createNotification.mockResolvedValue(makeNewNotification());
      mocks.replayExecutionRepository.createReplayExecution.mockResolvedValue(makeReplayExecution());

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
      );

      const result = await service.replayNotification({
        notificationId: UUID,
        reason: 'Test replay',
      });

      expect(result.replayId).toBe('replay-1');
      expect(result.notificationId).toBe(NEW_UUID);
      expect(mocks.notificationRepository.createNotification).toHaveBeenCalled();
      expect(mocks.replayExecutionRepository.createReplayExecution).toHaveBeenCalled();
      expect(mocks.queue.addNotificationJob).toHaveBeenCalledWith(NEW_UUID);
      // Should record REPLAY_REQUESTED event
      expect(mocks.eventRepository.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.REPLAY_REQUESTED }),
      );
    });

    it('throws NOT_FOUND when original notification does not exist', async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById.mockResolvedValue(null);

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
      );

      await expect(service.replayNotification({ notificationId: UUID })).rejects.toThrow(HttpError);
      try {
        await service.replayNotification({ notificationId: UUID });
      } catch (error) {
        expect((error as HttpError).code).toBe('NOT_FOUND');
      }
    });

    it('rejects non-replayable notification (CREATED)', async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById.mockResolvedValue(
        makeNotification(NotificationStatus.CREATED),
      );

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
      );

      await expect(service.replayNotification({ notificationId: UUID })).rejects.toThrow(HttpError);
      try {
        await service.replayNotification({ notificationId: UUID });
      } catch (error) {
        expect((error as HttpError).code).toBe('REPLAY_NOT_ALLOWED');
      }
    });

    it('rejects non-replayable notification (QUEUED)', async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById.mockResolvedValue(
        makeNotification(NotificationStatus.QUEUED),
      );

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
      );

      await expect(service.replayNotification({ notificationId: UUID })).rejects.toThrow(HttpError);
    });

    it('rejects non-replayable notification (PROCESSING)', async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById.mockResolvedValue(
        makeNotification(NotificationStatus.PROCESSING),
      );

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
      );

      await expect(service.replayNotification({ notificationId: UUID })).rejects.toThrow(HttpError);
    });

    it('throws QUEUE_UNAVAILABLE when enqueue fails', async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById
        .mockResolvedValueOnce(makeNotification())
        .mockResolvedValueOnce(makeNewNotification());
      mocks.notificationRepository.createNotification.mockResolvedValue(makeNewNotification());
      mocks.replayExecutionRepository.createReplayExecution.mockResolvedValue(makeReplayExecution());
      mocks.queue.addNotificationJob.mockRejectedValue(new Error('Redis down'));

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
      );

      try {
        await service.replayNotification({ notificationId: UUID, reason: 'test' });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).code).toBe('QUEUE_UNAVAILABLE');
      }
      // Should mark FAILED and record DELIVERY_FAILED event
      expect(mocks.notificationRepository.updateNotificationStatus).toHaveBeenCalledWith(
        NEW_UUID,
        NotificationStatus.FAILED,
      );
    });

    it('creates ReplayExecution linking original to new notification', async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById
        .mockResolvedValueOnce(makeNotification())
        .mockResolvedValueOnce(makeNewNotification());
      mocks.notificationRepository.createNotification.mockResolvedValue(makeNewNotification());
      mocks.replayExecutionRepository.createReplayExecution.mockResolvedValue(makeReplayExecution());

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
      );

      await service.replayNotification({ notificationId: UUID, reason: 'test' });

      expect(mocks.replayExecutionRepository.createReplayExecution).toHaveBeenCalledWith({
        originalNotificationId: UUID,
        reason: 'test',
        triggeredBy: 'api',
      });
      expect(mocks.replayExecutionRepository.updateNewNotificationId).toHaveBeenCalledWith(
        'replay-1',
        NEW_UUID,
      );
    });

    it('allows replay of FAILED status', async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById
        .mockResolvedValueOnce(makeNotification(NotificationStatus.FAILED))
        .mockResolvedValueOnce(makeNewNotification());
      mocks.notificationRepository.createNotification.mockResolvedValue(makeNewNotification());
      mocks.replayExecutionRepository.createReplayExecution.mockResolvedValue(makeReplayExecution());

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
      );

      const result = await service.replayNotification({ notificationId: UUID });
      expect(result.replayId).toBe('replay-1');
    });

    it('allows replay of DLQ status', async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById
        .mockResolvedValueOnce(makeNotification(NotificationStatus.DLQ))
        .mockResolvedValueOnce(makeNewNotification());
      mocks.notificationRepository.createNotification.mockResolvedValue(makeNewNotification());
      mocks.replayExecutionRepository.createReplayExecution.mockResolvedValue(makeReplayExecution());

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
      );

      const result = await service.replayNotification({ notificationId: UUID });
      expect(result.replayId).toBe('replay-1');
    });
  });

  describe('getReplayHistory', () => {
    it('returns replay history for existing notification', async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById.mockResolvedValue(makeNotification());
      const executions = [makeReplayExecution()];
      mocks.replayExecutionRepository.findByOriginalNotificationId.mockResolvedValue(executions);

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
      );

      const result = await service.getReplayHistory(UUID);
      expect(result).toHaveLength(1);
      expect(mocks.replayExecutionRepository.findByOriginalNotificationId).toHaveBeenCalledWith(UUID);
    });

    it('throws NOT_FOUND for non-existent notification', async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById.mockResolvedValue(null);

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
      );

      await expect(service.getReplayHistory(UUID)).rejects.toThrow(HttpError);
      try {
        await service.getReplayHistory(UUID);
      } catch (error) {
        expect((error as HttpError).code).toBe('NOT_FOUND');
      }
    });
  });
});
