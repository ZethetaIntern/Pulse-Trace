import { BullMQMonitoringRepository } from '../repositories/bullmq-monitoring-repository';
import { Queue } from 'bullmq';
import { QueueMetrics } from '../repositories/bullmq-monitoring-repository';

let mockClientPromise = Promise.resolve({ ping: jest.fn().mockResolvedValue('PONG') });

const mockQueue = {
  get client() {
    return mockClientPromise;
  },
  isPaused: jest.fn().mockResolvedValue(false),
  getJobCounts: jest.fn().mockResolvedValue({
    waiting: 10,
    active: 2,
    completed: 100,
    failed: 5,
    delayed: 3,
  }),
  close: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => mockQueue),
}));

jest.mock('../../../infrastructure/queue/notification-queue', () => ({
  NOTIFICATION_QUEUE_NAME: 'notifications',
  NOTIFICATION_WORKER_NAME: 'notification-worker',
  NOTIFICATION_JOB_NAME: 'process-notification',
}));

jest.mock('../../../infrastructure/database/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

describe('BullMQMonitoringRepository', () => {
  let repo: BullMQMonitoringRepository;
  let mockQueueObj: jest.Mocked<Queue>;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new BullMQMonitoringRepository();

    mockQueueObj = (Queue as unknown as jest.Mock).mock.results[0].value;
  });

  afterEach(async () => {
    await repo.close();
  });

  describe('checkPostgres', () => {
    it('returns ok when query succeeds', async () => {
      const result = await repo.checkPostgres();
      expect(result.status).toBe('ok');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns error when query fails', async () => {
      const { prisma } = await import('../../../infrastructure/database/prisma');
      (prisma.$queryRaw as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

      const result = await repo.checkPostgres();
      expect(result.status).toBe('error');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkRedis', () => {
    beforeEach(() => {
      mockClientPromise = Promise.resolve({ ping: jest.fn().mockResolvedValue('PONG') });
    });

    it('returns ok when ping succeeds', async () => {
      const result = await repo.checkRedis();
      expect(result.status).toBe('ok');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns error when ping fails', async () => {
      mockClientPromise = Promise.resolve({ ping: jest.fn().mockRejectedValue(new Error('Redis down')) });

      const result = await repo.checkRedis();
      expect(result.status).toBe('error');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkQueue', () => {
    it('returns ok when queue is not paused', async () => {
      mockQueueObj.isPaused.mockResolvedValueOnce(false);

      const result = await repo.checkQueue();
      expect(result.status).toBe('ok');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns paused when queue is paused', async () => {
      mockQueueObj.isPaused.mockResolvedValueOnce(true);

      const result = await repo.checkQueue();
      expect(result.status).toBe('paused');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns error when check fails', async () => {
      mockQueueObj.isPaused.mockRejectedValueOnce(new Error('Queue error'));

      const result = await repo.checkQueue();
      expect(result.status).toBe('error');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkWorker', () => {
    it('returns ok (inferred) when queue is operational', async () => {
      // Worker status is inferred from queue state since we don't create a worker
      const result = await repo.checkWorker();
      expect(result.status).toBe('ok');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getQueueMetrics', () => {
    it('returns queue metrics with all counts', async () => {
      mockQueueObj.getJobCounts.mockResolvedValueOnce({
        waiting: 10,
        active: 2,
        completed: 100,
        failed: 5,
        delayed: 3,
      });
      mockQueueObj.isPaused.mockResolvedValueOnce(false);

      const metrics = await repo.getQueueMetrics();

      expect(metrics).toEqual({
        queueName: 'notifications',
        isPaused: false,
        counts: {
          waiting: 10,
          active: 2,
          completed: 100,
          failed: 5,
          delayed: 3,
        },
      } satisfies QueueMetrics);
    });

    it('handles missing counts gracefully', async () => {
      mockQueueObj.getJobCounts.mockResolvedValueOnce({});
      mockQueueObj.isPaused.mockResolvedValueOnce(false);

      const metrics = await repo.getQueueMetrics();

      expect(metrics.counts.waiting).toBe(0);
      expect(metrics.counts.active).toBe(0);
      expect(metrics.counts.completed).toBe(0);
      expect(metrics.counts.failed).toBe(0);
      expect(metrics.counts.delayed).toBe(0);
    });
  });

  describe('getWorkerMetrics', () => {
    it('returns worker metrics with queue-level counts (inferred)', async () => {
      mockQueueObj.getJobCounts.mockResolvedValueOnce({
        waiting: 10,
        active: 2,
        completed: 100,
        failed: 5,
      });

      const metrics = await repo.getWorkerMetrics();

      expect(metrics.workers).toHaveLength(1);
      const worker = metrics.workers[0];
      expect(worker.name).toBe('notification-worker');
      expect(worker.status).toBe('running'); // Inferred
      expect(worker.isRunning).toBe(true); // Inferred
      expect(worker.concurrency).toBe(1);
      expect(worker.queueCounts.waiting).toBe(10);
      expect(worker.queueCounts.active).toBe(2);
      expect(worker.queueCounts.completed).toBe(100);
      expect(worker.queueCounts.failed).toBe(5);
      expect(worker.processUptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(worker.processedTotal).toBe(100);
      expect(worker.failedTotal).toBe(5);
    });

    it('returns zero counts when queue is empty', async () => {
      mockQueueObj.getJobCounts.mockResolvedValueOnce({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
      });

      const metrics = await repo.getWorkerMetrics();

      expect(metrics.workers[0].queueCounts.waiting).toBe(0);
      expect(metrics.workers[0].queueCounts.active).toBe(0);
      expect(metrics.workers[0].queueCounts.completed).toBe(0);
      expect(metrics.workers[0].queueCounts.failed).toBe(0);
      expect(metrics.workers[0].processedTotal).toBe(0);
      expect(metrics.workers[0].failedTotal).toBe(0);
    });
  });
});