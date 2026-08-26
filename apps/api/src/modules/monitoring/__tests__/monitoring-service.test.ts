import { MonitoringServiceImpl } from '../services/monitoring-service';
import { MonitoringRepository } from '../interfaces/monitoring-repository';
import { HealthCheckResult } from '../interfaces/monitoring-service';
import { QueueMetrics, WorkerMetrics } from '../repositories/bullmq-monitoring-repository';

const createMockRepository = (overrides: Partial<{
  postgres: HealthCheckResult['postgres'];
  redis: HealthCheckResult['redis'];
  queue: HealthCheckResult['queue'];
  worker: HealthCheckResult['worker'];
  queueMetrics: QueueMetrics;
  workerMetrics: WorkerMetrics;
}> = {}) => {
  const mock: jest.Mocked<MonitoringRepository> = {
    checkPostgres: jest.fn().mockResolvedValue(overrides.postgres ?? { status: 'ok', latencyMs: 5 }),
    checkRedis: jest.fn().mockResolvedValue(overrides.redis ?? { status: 'ok', latencyMs: 3 }),
    checkQueue: jest.fn().mockResolvedValue(overrides.queue ?? { status: 'ok', latencyMs: 2 }),
    checkWorker: jest.fn().mockResolvedValue(overrides.worker ?? { status: 'ok', latencyMs: 1 }),
    getQueueMetrics: jest.fn().mockResolvedValue(overrides.queueMetrics ?? {
      queueName: 'notifications',
      isPaused: false,
      counts: { waiting: 10, active: 2, completed: 100, failed: 5, delayed: 3 },
    }),
    getWorkerMetrics: jest.fn().mockResolvedValue(overrides.workerMetrics ?? {
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
  };
  return mock;
};

describe('MonitoringService', () => {
  let service: MonitoringServiceImpl;
  let mockRepo: jest.Mocked<MonitoringRepository>;

  beforeEach(() => {
    mockRepo = createMockRepository();
    service = new MonitoringServiceImpl(mockRepo);
  });

  describe('getSystemHealth', () => {
    it('returns healthy when all checks pass', async () => {
      const health = await service.getSystemHealth();

      expect(health.status).toBe('healthy');
      expect(health.checks.api.status).toBe('ok');
      expect(health.checks.postgres.status).toBe('ok');
      expect(health.checks.redis.status).toBe('ok');
      expect(health.checks.queue.status).toBe('ok');
      expect(health.checks.worker.status).toBe('ok');
      expect(health.timestamp).toBeDefined();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.version).toBe('1.0.0');
    });

    it('returns unhealthy when postgres check fails', async () => {
      mockRepo.checkPostgres.mockResolvedValue({ status: 'error', latencyMs: 100 });

      const health = await service.getSystemHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.checks.postgres.status).toBe('error');
    });

    it('returns unhealthy when redis check fails', async () => {
      mockRepo.checkRedis.mockResolvedValue({ status: 'error', latencyMs: 100 });

      const health = await service.getSystemHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.checks.redis.status).toBe('error');
    });

    it('returns unhealthy when queue check fails', async () => {
      mockRepo.checkQueue.mockResolvedValue({ status: 'error', latencyMs: 100 });

      const health = await service.getSystemHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.checks.queue.status).toBe('error');
    });

    it('returns unhealthy when worker check fails', async () => {
      mockRepo.checkWorker.mockResolvedValue({ status: 'error', latencyMs: 100 });

      const health = await service.getSystemHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.checks.worker.status).toBe('error');
    });

    it('returns degraded when queue is paused', async () => {
      mockRepo.checkQueue.mockResolvedValue({ status: 'paused', latencyMs: 5 });

      const health = await service.getSystemHealth();

      expect(health.status).toBe('degraded');
      expect(health.checks.queue.status).toBe('paused');
    });

    it('returns degraded when worker is stopped', async () => {
      mockRepo.checkWorker.mockResolvedValue({ status: 'stopped', latencyMs: 5 });

      const health = await service.getSystemHealth();

      expect(health.status).toBe('degraded');
      expect(health.checks.worker.status).toBe('stopped');
    });

    it('includes latency in all checks', async () => {
      const health = await service.getSystemHealth();

      expect(health.checks.postgres.latencyMs).toBeDefined();
      expect(health.checks.redis.latencyMs).toBeDefined();
      expect(health.checks.queue.latencyMs).toBeDefined();
      expect(health.checks.worker.latencyMs).toBeDefined();
    });
  });

  describe('getQueueMetrics', () => {
    it('returns queue metrics from repository', async () => {
      const metrics = await service.getQueueMetrics();

      expect(metrics.queueName).toBe('notifications');
      expect(metrics.isPaused).toBe(false);
      expect(metrics.counts.waiting).toBe(10);
      expect(metrics.counts.active).toBe(2);
      expect(metrics.counts.completed).toBe(100);
      expect(metrics.counts.failed).toBe(5);
      expect(metrics.counts.delayed).toBe(3);
      expect(mockRepo.getQueueMetrics).toHaveBeenCalledTimes(1);
    });
  });

  describe('getWorkerMetrics', () => {
    it('returns worker metrics from repository', async () => {
      const metrics = await service.getWorkerMetrics();

      expect(metrics.workers).toHaveLength(1);
      expect(metrics.workers[0].name).toBe('notification-worker');
      expect(metrics.workers[0].status).toBe('running');
      expect(metrics.workers[0].concurrency).toBe(1);
      expect(metrics.workers[0].isRunning).toBe(true);
      expect(metrics.workers[0].processedTotal).toBe(100);
      expect(metrics.workers[0].failedTotal).toBe(5);
      expect(mockRepo.getWorkerMetrics).toHaveBeenCalledTimes(1);
    });
  });
});