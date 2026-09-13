import { Admin } from 'kafkajs';
import { KafkaHealthIndicator } from '../../../infrastructure/kafka/kafka-health-indicator';

describe('KafkaHealthIndicator Unit Tests', () => {
  let mockAdmin: jest.Mocked<Admin>;

  beforeEach(() => {
    mockAdmin = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      describeCluster: jest.fn().mockResolvedValue({
        brokers: [{ nodeId: 1, host: 'localhost', port: 9092 }],
        controller: 1,
        clusterId: 'test-cluster-id',
      }),
    } as unknown as jest.Mocked<Admin>;
  });

  it('should return status "ok" with cluster details when Kafka is reachable', async () => {
    const indicator = new KafkaHealthIndicator(() => mockAdmin);
    const result = await indicator.checkHealth();

    expect(result.status).toBe('ok');
    expect(result.brokersCount).toBe(1);
    expect(result.clusterId).toBe('test-cluster-id');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(mockAdmin.connect).toHaveBeenCalledTimes(1);
    expect(mockAdmin.disconnect).toHaveBeenCalledTimes(1);
  });

  it('should return status "error" with error message when Kafka is unreachable', async () => {
    mockAdmin.connect.mockRejectedValueOnce(new Error('Connection refused'));

    const indicator = new KafkaHealthIndicator(() => mockAdmin);
    const result = await indicator.checkHealth();

    expect(result.status).toBe('error');
    expect(result.error).toBe('Connection refused');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(mockAdmin.disconnect).toHaveBeenCalledTimes(1);
  });
});
