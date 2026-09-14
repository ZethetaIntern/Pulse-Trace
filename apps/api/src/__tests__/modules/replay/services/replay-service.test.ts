import {
  NotificationStatus,
  Notification,
  NotificationEvent,
  ReplayExecution,
  Channel,
  Category,
  Priority,
  EventType,
  ReplayStatus,
  NotificationDeadLetter,
} from "@prisma/client";
import { ReplayService } from "../../../../modules/replay/services/replay-service";
import { NotificationRepository } from "../../../../modules/notifications/interfaces/notification-repository";
import { NotificationEventRepository } from "../../../../modules/notifications/interfaces/notification-event-repository";
import { QueueService } from "../../../../modules/notifications/interfaces/queue-service";
import { ReplayExecutionRepository } from "../../../../modules/replay/interfaces/replay-execution-repository";
import { DeadLetterRepository } from "../../../../modules/dlq/interfaces/dead-letter-repository";
import { HttpError } from "../../../../shared/errors/http-error";
import { env } from "../../../../config/env";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const NEW_UUID = "660e8400-e29b-41d4-a716-446655440001";

function makeNotification(status: NotificationStatus = NotificationStatus.DLQ): Notification {
  return {
    id: UUID,
    userId: UUID,
    templateId: UUID,
    channel: Channel.EMAIL,
    category: Category.TRANSACTIONAL,
    priority: Priority.NORMAL,
    status,
    payload: { name: "Alice" },
    metadata: { source: "test", correlationId: "corr-123" },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeNewNotification(): Notification {
  return {
    ...makeNotification(NotificationStatus.QUEUED),
    id: NEW_UUID,
    metadata: { replayedFrom: UUID, retryCount: 0 },
  };
}

function makeReplayExecution(status: ReplayStatus = ReplayStatus.REQUESTED): ReplayExecution {
  return {
    id: "replay-1",
    originalNotificationId: UUID,
    newNotificationId: NEW_UUID,
    reason: "Test replay",
    triggeredBy: "api",
    status,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
  };
}

function makeDeadLetter(): NotificationDeadLetter {
  return {
    id: "dlq-1",
    notificationId: UUID,
    originalPayload: { name: "Alice" },
    failedAttempts: 5,
    lastErrorCode: "MAX_RETRIES_EXCEEDED",
    lastErrorMessage: "Failed after 5 attempts",
    errorDetails: [],
    createdAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
  };
}

function makeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    id: "event-1",
    notificationId: UUID,
    eventType: EventType.REPLAY_REQUESTED,
    statusBefore: null,
    statusAfter: NotificationStatus.QUEUED,
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
  deadLetterRepository: jest.Mocked<DeadLetterRepository>;
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
      createNotificationTransactional: jest.fn(),
    },
    eventRepository: {
      recordEvent: jest.fn().mockResolvedValue(makeEvent()),
      listEventsByNotificationId: jest.fn().mockResolvedValue([]),
    },
    queue: {
      addNotificationJob: jest.fn().mockResolvedValue("job-1"),
    },
    replayExecutionRepository: {
      createReplayExecution: jest.fn(),
      updateNewNotificationId: jest.fn(),
      findById: jest.fn(),
      findByOriginalNotificationId: jest.fn(),
      findReplayExecutionByNewNotificationId: jest.fn(),
      updateStatus: jest.fn(),
      findActiveReplayByOriginalId: jest.fn(),
    },
    deadLetterRepository: {
      createDeadLetter: jest.fn(),
      findDeadLetterByNotificationId: jest.fn(),
      resolveDeadLetter: jest.fn(),
      countDeadLetters: jest.fn().mockResolvedValue(0),
    },
  };
}

describe("ReplayService", () => {
  let originalMode: "bullmq" | "kafka";

  beforeEach(() => {
    originalMode = env.notificationProcessingMode;
  });

  afterEach(() => {
    (env as any).notificationProcessingMode = originalMode;
  });

  describe("replayNotification - BullMQ Mode", () => {
    beforeEach(() => {
      (env as any).notificationProcessingMode = "bullmq";
    });

    it("replays a DLQ notification successfully in BullMQ mode", async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById
        .mockResolvedValueOnce(makeNotification(NotificationStatus.DLQ))
        .mockResolvedValueOnce(makeNewNotification());
      mocks.deadLetterRepository.findDeadLetterByNotificationId.mockResolvedValue(makeDeadLetter());
      mocks.replayExecutionRepository.findActiveReplayByOriginalId.mockResolvedValue(null);
      mocks.notificationRepository.createNotification.mockResolvedValue(makeNewNotification());
      mocks.replayExecutionRepository.createReplayExecution.mockResolvedValue(makeReplayExecution());

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
        mocks.deadLetterRepository,
      );

      const result = await service.replayNotification({
        notificationId: UUID,
        reason: "Test replay",
        operatorId: "op-1",
      });

      expect(result.replayId).toBe("replay-1");
      expect(result.notificationId).toBe(NEW_UUID);
      expect(mocks.notificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: UUID,
          templateId: UUID,
          channel: Channel.EMAIL,
          category: Category.TRANSACTIONAL,
          priority: Priority.NORMAL,
          variables: { name: "Alice" },
          metadata: expect.objectContaining({
            replayedFrom: UUID,
            replayId: "replay-1",
            replayReason: "Test replay",
            operatorId: "op-1",
            correlationId: "corr-123",
          }),
        }),
      );
      expect(mocks.replayExecutionRepository.createReplayExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          originalNotificationId: UUID,
          reason: "Test replay",
          triggeredBy: "op-1",
        }),
      );
      expect(mocks.queue.addNotificationJob).toHaveBeenCalledWith(NEW_UUID);
      expect(mocks.eventRepository.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.REPLAY_REQUESTED }),
      );
    });

    it("throws NOT_FOUND when original notification does not exist", async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById.mockResolvedValue(null);

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
        mocks.deadLetterRepository,
      );

      await expect(service.replayNotification({ notificationId: UUID })).rejects.toThrow(HttpError);
      try {
        await service.replayNotification({ notificationId: UUID });
      } catch (error) {
        expect((error as HttpError).code).toBe("NOT_FOUND");
      }
    });

    it("rejects non-DLQ notification (e.g. DELIVERED)", async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById.mockResolvedValue(
        makeNotification(NotificationStatus.DELIVERED),
      );
      mocks.deadLetterRepository.findDeadLetterByNotificationId.mockResolvedValue(null);

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
        mocks.deadLetterRepository,
      );

      await expect(service.replayNotification({ notificationId: UUID })).rejects.toThrow(HttpError);
      try {
        await service.replayNotification({ notificationId: UUID });
      } catch (error) {
        expect((error as HttpError).code).toBe("REPLAY_NOT_ALLOWED");
      }
    });

    it("rejects DLQ notification without dead letter record", async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById.mockResolvedValue(
        makeNotification(NotificationStatus.DLQ),
      );
      mocks.deadLetterRepository.findDeadLetterByNotificationId.mockResolvedValue(null);

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
        mocks.deadLetterRepository,
      );

      await expect(service.replayNotification({ notificationId: UUID })).rejects.toThrow(HttpError);
      try {
        await service.replayNotification({ notificationId: UUID });
      } catch (error) {
        expect((error as HttpError).code).toBe("REPLAY_NOT_ALLOWED");
      }
    });

    it("rejects when an active replay already exists", async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById.mockResolvedValue(
        makeNotification(NotificationStatus.DLQ),
      );
      mocks.deadLetterRepository.findDeadLetterByNotificationId.mockResolvedValue(makeDeadLetter());
      mocks.replayExecutionRepository.findActiveReplayByOriginalId.mockResolvedValue(
        makeReplayExecution(ReplayStatus.RUNNING),
      );

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
        mocks.deadLetterRepository,
      );

      await expect(service.replayNotification({ notificationId: UUID })).rejects.toThrow(HttpError);
      try {
        await service.replayNotification({ notificationId: UUID });
      } catch (error) {
        expect((error as HttpError).code).toBe("ACTIVE_REPLAY_EXISTS");
        expect((error as HttpError).statusCode).toBe(409);
      }
    });
  });

  describe("replayNotification - Kafka Mode", () => {
    beforeEach(() => {
      (env as any).notificationProcessingMode = "kafka";
    });

    it("executes atomic transaction with OutboxEvent and ReplayExecution in Kafka mode", async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById
        .mockResolvedValueOnce(makeNotification(NotificationStatus.DLQ))
        .mockResolvedValueOnce(makeNewNotification());
      mocks.deadLetterRepository.findDeadLetterByNotificationId.mockResolvedValue(makeDeadLetter());
      mocks.replayExecutionRepository.findActiveReplayByOriginalId.mockResolvedValue(null);
      (mocks.notificationRepository.createNotificationTransactional as jest.Mock).mockResolvedValue(
        makeNewNotification(),
      );
      mocks.replayExecutionRepository.createReplayExecution.mockResolvedValue(makeReplayExecution());

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
        mocks.deadLetterRepository,
      );

      const result = await service.replayNotification({
        notificationId: UUID,
        reason: "Operator Kafka Replay",
        operatorId: "operator-kafka",
      });

      expect(result.notificationId).toBe(NEW_UUID);
      expect(result.status).toBe(ReplayStatus.REQUESTED);
      expect(mocks.notificationRepository.createNotificationTransactional).toHaveBeenCalled();
      // QueueService must NOT be called in Kafka mode
      expect(mocks.queue.addNotificationJob).not.toHaveBeenCalled();
    });

    it("translates P2002 DB unique constraint violation to 409 ACTIVE_REPLAY_EXISTS", async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById.mockResolvedValue(
        makeNotification(NotificationStatus.DLQ),
      );
      mocks.deadLetterRepository.findDeadLetterByNotificationId.mockResolvedValue(makeDeadLetter());
      mocks.replayExecutionRepository.findActiveReplayByOriginalId.mockResolvedValue(null);

      const prismaError = new Error("Unique constraint failed");
      (prismaError as any).code = "P2002";
      (mocks.notificationRepository.createNotificationTransactional as jest.Mock).mockRejectedValue(prismaError);

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
        mocks.deadLetterRepository,
      );

      await expect(service.replayNotification({ notificationId: UUID })).rejects.toThrow(HttpError);
      try {
        await service.replayNotification({ notificationId: UUID });
      } catch (error) {
        expect((error as HttpError).code).toBe("ACTIVE_REPLAY_EXISTS");
        expect((error as HttpError).statusCode).toBe(409);
      }
    });
  });

  describe("getReplayHistory", () => {
    it("returns mapped replay history with lifecycle statuses", async () => {
      const mocks = createMocks();
      mocks.notificationRepository.findNotificationById
        .mockResolvedValueOnce(makeNotification(NotificationStatus.DLQ));
      mocks.replayExecutionRepository.findByOriginalNotificationId.mockResolvedValue([
        makeReplayExecution(ReplayStatus.COMPLETED),
      ]);

      const service = new ReplayService(
        mocks.notificationRepository,
        mocks.eventRepository,
        mocks.queue,
        mocks.replayExecutionRepository,
        mocks.deadLetterRepository,
      );

      const history = await service.getReplayHistory(UUID);
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe("replay-1");
      expect(history[0].status).toBe(ReplayStatus.COMPLETED);
      expect(history[0].newNotificationId).toBe(NEW_UUID);
    });
  });
});
