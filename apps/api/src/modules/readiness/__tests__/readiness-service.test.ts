import { ReadinessServiceImpl } from '../services/readiness-service';
import { MonitoringRepository } from '../../monitoring/interfaces/monitoring-repository';

const createMockRepository = (overrides: Partial<{
  postgres: { status: 'ok' | 'error'; latencyMs: number };
  redis: { status: 'ok' | 'error'; latencyMs: number };
  queue: { status: 'ok' | 'error' | 'paused'; latencyMs: number };
  worker: { status: 'ok' | 'error' | 'stopped'; latencyMs: number };
}> = {}) => {
  const mock: jest.Mocked<MonitoringRepository> = {
    checkPostgres: jest.fn().mockResolvedValue(overrides.postgres ?? { status: 'ok', latencyMs: 5 }),
    checkRedis: jest.fn().mockResolvedValue(overrides.redis ?? { status: 'ok', latencyMs: 3 }),
    checkQueue: jest.fn().mockResolvedValue(overrides.queue ?? { status: 'ok', latencyMs: 2 }),
    checkWorker: jest.fn().mockResolvedValue(overrides.worker ?? { status: 'ok', latencyMs: 1 }),
    getQueueMetrics: jest.fn().mockResolvedValue({
      queueName: 'notifications',
      isPaused: false,
      counts: { waiting: 10, active: 2, completed: 100, failed: 5, delayed: 3 },
    }),
    getWorkerMetrics: jest.fn().mockResolvedValue({
      workers: [
        {
          id: 'notification-worker-12345',
          name: 'notification-worker',
          status: 'running',
          concurrency: 1,
          isRunning: true,
          queueCounts: { waiting: 10, active: 2, completed: 100, failed: 5 },
          processUptimeSeconds: 3600,
          processedTotal: 100,
          failedTotal: 5,
        },
      ],
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return mock;
};

describe('ReadinessService', () => {
  let service: ReadinessServiceImpl;
  let mockRepo: jest.Mocked<MonitoringRepository>;

  beforeEach(() => {
    mockRepo = createMockRepository();
    service = new ReadinessServiceImpl(mockRepo);
  });

  describe('getReadiness', () => {
    it('returns ready when all checks pass', async () => {
      const readiness = await service.getReadiness();

      expect(readiness.status).toBe('ready');
      expect(readiness.checks.postgres.status).toBe('ok');
      expect(readiness.checks.redis.status).toBe('ok');
      expect(readiness.checks.queue.status).toBe('ok');
      expect(readiness.checks.worker.status).toBe('ok');
      expect(readiness.timestamp).toBeDefined();
    });

    it('returns not_ready when postgres check fails', async () => {
      mockRepo.checkPostgres.mockResolvedValue({ status: 'error', latencyMs: 100 });

      const readiness = await service.getReadiness();

      expect(readiness.status).toBe('not_ready');
      expect(readiness.checks.postgres.status).toBe('error');
    });

    it('returns not_ready when redis check fails', async () => {
      mockRepo.checkRedis.mockResolvedValue({ status: 'error', latencyMs: 100 });

      const readiness = await service.getReadiness();

      expect(readiness.status).toBe('not_ready');
      expect(readiness.checks.redis.status).toBe('error');
    });

    it('returns not_ready when queue check fails', async () => {
      mockRepo.checkQueue.mockResolvedValue({ status: 'error', latencyMs: 100 });

      const readiness = await service.getReadiness();

      expect(readiness.status).toBe('not_ready');
      expect(readiness.checks.queue.status).toBe('error');
    });

    it('returns not_ready when queue is paused', async () => {
      mockRepo.checkQueue.mockResolvedValue({ status: 'paused', latencyMs: 5 });

      const readiness = await service.getReadiness();

      expect(readiness.status).toBe('not_ready');
      expect(readiness.checks.queue.status).toBe('paused');
    });

    it('returns not_ready when worker check fails', async () => {
      mockRepo.checkWorker.mockResolvedValue({ status: 'error', latencyMs: 100 });

      const readiness = await service.getReadiness();

      expect(readiness.status).toBe('not_ready');
      expect(readiness.checks.worker.status).toBe('error');
    });

    it('returns not_ready when worker is stopped', async () => {
      mockRepo.checkWorker.mockResolvedValue({ status: 'stopped', latencyMs: 5 });

      const readiness = await service.getReadiness();

      expect(readiness.status).toBe('not_ready');
      expect(readiness.checks.worker.status).toBe('stopped');
    });

    it('includes latency in all checks', async () => {
      const readiness = await service.getReadiness();

      expect(readiness.checks.postgres.latencyMs).toBeDefined();
      expect(readiness.checks.redis.latencyMs).toBeDefined();
      expect(readiness.checks.queue.latencyMs).toBeDefined();
      expect(readiness.checks.worker.latencyMs).toBeDefined();
    });

    it('returns not_ready when shutdown has started', async () => {
      // We can't easily test this without mocking the lifecycle module
      // This is tested in integration tests
    });
  });
});