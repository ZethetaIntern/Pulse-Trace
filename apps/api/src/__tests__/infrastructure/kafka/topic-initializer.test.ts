import { Admin } from 'kafkajs';
import {
  initializeKafkaTopics,
  REQUIRED_KAFKA_TOPICS,
  DEFAULT_PARTITION_COUNT,
  DEFAULT_REPLICATION_FACTOR,
} from '../../../infrastructure/kafka/topic-initializer';

describe('TopicInitializer Unit Tests', () => {
  let mockAdmin: jest.Mocked<Admin>;

  beforeEach(() => {
    mockAdmin = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      listTopics: jest.fn().mockResolvedValue([]),
      createTopics: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Admin>;
  });

  it('should create all 5 required topics with 4 partitions if none exist', async () => {
    mockAdmin.listTopics.mockResolvedValueOnce([]);

    const result = await initializeKafkaTopics({ admin: mockAdmin });

    expect(result.createdTopics).toEqual(expect.arrayContaining([...REQUIRED_KAFKA_TOPICS]));
    expect(result.existingTopics).toHaveLength(0);
    expect(mockAdmin.createTopics).toHaveBeenCalledTimes(1);
    expect(mockAdmin.createTopics).toHaveBeenCalledWith({
      topics: REQUIRED_KAFKA_TOPICS.map((topic: string) => ({
        topic,
        numPartitions: DEFAULT_PARTITION_COUNT,
        replicationFactor: DEFAULT_REPLICATION_FACTOR,
      })),
      waitForLeaders: true,
    });
  });

  it('should only create missing topics when some already exist', async () => {
    mockAdmin.listTopics.mockResolvedValueOnce(['notifications.high', 'notifications.low']);

    const result = await initializeKafkaTopics({ admin: mockAdmin });

    expect(result.existingTopics).toEqual(['notifications.high', 'notifications.low']);
    expect(result.createdTopics).toEqual(['notifications.normal', 'notifications.retry', 'notifications.dlq']);
    expect(mockAdmin.createTopics).toHaveBeenCalledTimes(1);
    expect(mockAdmin.createTopics).toHaveBeenCalledWith({
      topics: [
        { topic: 'notifications.normal', numPartitions: 4, replicationFactor: 1 },
        { topic: 'notifications.retry', numPartitions: 4, replicationFactor: 1 },
        { topic: 'notifications.dlq', numPartitions: 4, replicationFactor: 1 },
      ],
      waitForLeaders: true,
    });
  });

  it('should skip creation if all 5 topics already exist', async () => {
    mockAdmin.listTopics.mockResolvedValueOnce([...REQUIRED_KAFKA_TOPICS]);

    const result = await initializeKafkaTopics({ admin: mockAdmin });

    expect(result.existingTopics).toEqual(expect.arrayContaining([...REQUIRED_KAFKA_TOPICS]));
    expect(result.createdTopics).toHaveLength(0);
    expect(mockAdmin.createTopics).not.toHaveBeenCalled();
  });
});
