import { OutboxStatus, EventType } from '@prisma/client';
import { Producer, RecordMetadata } from 'kafkajs';
import { KafkaPublisherSink } from '../../../../modules/outbox/sinks/kafka-publisher-sink';

describe('KafkaPublisherSink Unit Tests', () => {
  let mockProducer: jest.Mocked<Producer>;
  let sink: KafkaPublisherSink;

  beforeEach(() => {
    mockProducer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue([
        {
          topicName: 'notifications.high',
          partition: 0,
          errorCode: 0,
          offset: '123',
          timestamp: '1789230000000',
        } as RecordMetadata,
      ]),
    } as unknown as jest.Mocked<Producer>;

    sink = new KafkaPublisherSink(mockProducer);
  });

  it('should connect to Kafka producer and send message with correct fields and headers', async () => {
    const mockEvent = {
      id: 'outbox-uuid-1',
      aggregateType: 'Notification',
      aggregateId: 'notif-uuid-1',
      eventType: EventType.NOTIFICATION_CREATED,
      topic: 'notifications.high',
      partitionKey: 'user-uuid-1',
      payload: {
        notificationId: 'notif-uuid-1',
        userId: 'user-uuid-1',
        templateId: 'tpl-1',
        channel: 'EMAIL',
        category: 'TRANSACTIONAL',
        priority: 'HIGH',
        correlationId: 'req-corr-123',
      },
      status: OutboxStatus.PROCESSING,
      retryCount: 0,
      lastError: null,
      lockedAt: new Date(),
      lockedBy: 'worker-1',
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await sink.publish(mockEvent);

    expect(mockProducer.connect).toHaveBeenCalledTimes(1);
    expect(mockProducer.send).toHaveBeenCalledTimes(1);
    expect(mockProducer.send).toHaveBeenCalledWith({
      topic: 'notifications.high',
      messages: [
        {
          key: 'user-uuid-1',
          value: JSON.stringify(mockEvent.payload),
          headers: {
            'x-event-id': 'outbox-uuid-1',
            'x-event-type': EventType.NOTIFICATION_CREATED,
            'x-correlation-id': 'req-corr-123',
          },
        },
      ],
    });
  });

  it('should reuse active connection across multiple publish calls', async () => {
    const mockEvent = {
      id: 'outbox-uuid-2',
      aggregateType: 'Notification',
      aggregateId: 'notif-uuid-2',
      eventType: EventType.NOTIFICATION_CREATED,
      topic: 'notifications.normal',
      partitionKey: 'user-uuid-2',
      payload: { correlationId: 'req-2' },
      status: OutboxStatus.PROCESSING,
      retryCount: 0,
      lastError: null,
      lockedAt: new Date(),
      lockedBy: 'worker-1',
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await sink.publish(mockEvent);
    await sink.publish(mockEvent);

    expect(mockProducer.connect).toHaveBeenCalledTimes(1);
    expect(mockProducer.send).toHaveBeenCalledTimes(2);
  });

  it('should rethrow producer errors without catching or swallowing them', async () => {
    const sendError = new Error('Kafka broker not available');
    mockProducer.send.mockRejectedValueOnce(sendError);

    const mockEvent = {
      id: 'outbox-uuid-3',
      aggregateType: 'Notification',
      aggregateId: 'notif-uuid-3',
      eventType: EventType.NOTIFICATION_CREATED,
      topic: 'notifications.normal',
      partitionKey: 'user-uuid-3',
      payload: {},
      status: OutboxStatus.PROCESSING,
      retryCount: 0,
      lastError: null,
      lockedAt: new Date(),
      lockedBy: 'worker-1',
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(sink.publish(mockEvent)).rejects.toThrow('Kafka broker not available');
  });

  it('should disconnect the producer cleanly', async () => {
    await sink.connect();
    await sink.disconnect();

    expect(mockProducer.disconnect).toHaveBeenCalledTimes(1);
  });
});
