import { EventType, OutboxEvent, OutboxStatus } from '@prisma/client';
import { OutboxRepository } from '../../../../modules/outbox/interfaces/outbox-repository';
import { OutboxPublisher } from '../../../../modules/outbox/services/outbox-publisher';
import { InMemoryPublisherSink } from '../../../../modules/outbox/sinks/in-memory-publisher-sink';

describe('OutboxPublisher', () => {
  let mockRepository: jest.Mocked<OutboxRepository>;
  let sink: InMemoryPublisherSink;
  let publisher: OutboxPublisher;

  const sampleEvent: OutboxEvent = {
    id: 'outbox-1',
    aggregateType: 'Notification',
    aggregateId: 'notif-1',
    eventType: EventType.NOTIFICATION_CREATED,
    topic: 'notifications.normal',
    partitionKey: 'user-1',
    payload: { notificationId: 'notif-1', userId: 'user-1' },
    status: OutboxStatus.PENDING,
    retryCount: 0,
    lastError: null,
    lockedAt: null,
    lockedBy: null,
    createdAt: new Date(),
    publishedAt: null,
  };

  beforeEach(() => {
    mockRepository = {
      createOutboxEvent: jest.fn(),
      claimBatch: jest.fn(),
      markPublished: jest.fn(),
      markFailed: jest.fn(),
      findOutboxEventById: jest.fn(),
      findPendingEvents: jest.fn(),
      countByStatus: jest.fn(),
    };
    sink = new InMemoryPublisherSink();
    publisher = new OutboxPublisher(mockRepository, sink, {
      batchSize: 10,
      leaseTtlMs: 30000,
      workerId: 'test-worker',
    });
  });

  afterEach(async () => {
    await publisher.stop();
  });

  it('should return 0 when no events are claimed', async () => {
    mockRepository.claimBatch.mockResolvedValue([]);

    const publishedCount = await publisher.pollAndPublishOnce();

    expect(publishedCount).toBe(0);
    expect(mockRepository.claimBatch).toHaveBeenCalledWith(10, 30000, 'test-worker');
    expect(mockRepository.markPublished).not.toHaveBeenCalled();
  });

  it('should publish claimed events and mark them PUBLISHED on success', async () => {
    mockRepository.claimBatch.mockResolvedValue([sampleEvent]);
    mockRepository.markPublished.mockResolvedValue();

    const publishedCount = await publisher.pollAndPublishOnce();

    expect(publishedCount).toBe(1);
    expect(sink.getPublishedEvents()).toHaveLength(1);
    expect(sink.getPublishedEvents()[0].id).toBe('outbox-1');
    expect(mockRepository.markPublished).toHaveBeenCalledWith('outbox-1');
    expect(mockRepository.markFailed).not.toHaveBeenCalled();
  });

  it('should mark event FAILED and increment retry count when sink throws', async () => {
    mockRepository.claimBatch.mockResolvedValue([sampleEvent]);
    mockRepository.markFailed.mockResolvedValue();
    sink.setShouldFail(true, new Error('Broker connection refused'));

    const publishedCount = await publisher.pollAndPublishOnce();

    expect(publishedCount).toBe(0);
    expect(mockRepository.markPublished).not.toHaveBeenCalled();
    expect(mockRepository.markFailed).toHaveBeenCalledWith(
      'outbox-1',
      'Broker connection refused',
      1,
    );
  });

  it('should handle partial batch failure independently', async () => {
    const event2: OutboxEvent = {
      ...sampleEvent,
      id: 'outbox-2',
      aggregateId: 'notif-2',
    };

    mockRepository.claimBatch.mockResolvedValue([sampleEvent, event2]);
    mockRepository.markPublished.mockResolvedValue();
    mockRepository.markFailed.mockResolvedValue();

    // Sink fails only for event1
    jest.spyOn(sink, 'publish').mockImplementation(async (evt) => {
      if (evt.id === 'outbox-1') throw new Error('Transient sink error');
    });

    const publishedCount = await publisher.pollAndPublishOnce();

    expect(publishedCount).toBe(1);
    expect(mockRepository.markFailed).toHaveBeenCalledWith('outbox-1', 'Transient sink error', 1);
    expect(mockRepository.markPublished).toHaveBeenCalledWith('outbox-2');
  });

  it('should start and stop background polling cleanly', async () => {
    mockRepository.claimBatch.mockResolvedValue([]);

    publisher.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await publisher.stop();

    expect(mockRepository.claimBatch).toHaveBeenCalled();
  });
});
