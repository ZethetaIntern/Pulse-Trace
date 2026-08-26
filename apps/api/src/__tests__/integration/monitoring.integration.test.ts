import request from 'supertest';
import { app } from '../../app';
import { BullMQMonitoringRepository } from '../../modules/monitoring/repositories/bullmq-monitoring-repository';
import { getTestPrisma, cleanTestDatabase, cleanTestRedis, disconnectTestPrisma } from './helpers';

let prisma: ReturnType<typeof getTestPrisma>;
let monitoringRepo: BullMQMonitoringRepository;

beforeAll(async () => {
  prisma = getTestPrisma();
  await cleanTestRedis();
  await cleanTestDatabase(prisma);
  monitoringRepo = new BullMQMonitoringRepository();
});

afterAll(async () => {
  await monitoringRepo.close();
  await cleanTestDatabase(prisma);
  await cleanTestRedis();
  await disconnectTestPrisma();
});

describe('Monitoring API Integration', () => {
  describe('GET /api/v1/monitoring/health', () => {
    it('returns health status with all checks', async () => {
      const res = await request(app).get('/api/v1/monitoring/health').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(res.body.data.status);
      expect(res.body.data).toHaveProperty('timestamp');
      expect(res.body.data).toHaveProperty('uptime');
      expect(res.body.data).toHaveProperty('version', '1.0.0');
      expect(res.body.data).toHaveProperty('environment');
      expect(res.body.data).toHaveProperty('checks');
      expect(res.body.data.checks).toHaveProperty('api');
      expect(res.body.data.checks).toHaveProperty('postgres');
      expect(res.body.data.checks).toHaveProperty('redis');
      expect(res.body.data.checks).toHaveProperty('queue');
      expect(res.body.data.checks).toHaveProperty('worker');

      expect(res.body.data.checks.api).toHaveProperty('status', 'ok');
      expect(res.body.data.checks.postgres).toHaveProperty('status');
      expect(res.body.data.checks.redis).toHaveProperty('status');
      expect(res.body.data.checks.queue).toHaveProperty('status');
      expect(res.body.data.checks.worker).toHaveProperty('status');
    });

    it('includes latency in all checks', async () => {
      const res = await request(app).get('/api/v1/monitoring/health').expect(200);

      expect(res.body.data.checks.api).toHaveProperty('latencyMs');
      expect(res.body.data.checks.postgres).toHaveProperty('latencyMs');
      expect(res.body.data.checks.redis).toHaveProperty('latencyMs');
      expect(res.body.data.checks.queue).toHaveProperty('latencyMs');
      expect(res.body.data.checks.worker).toHaveProperty('latencyMs');
    });
  });

  describe('GET /api/v1/monitoring/queues', () => {
    it('returns queue metrics with all counts', async () => {
      const res = await request(app).get('/api/v1/monitoring/queues').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('queueName', 'notifications');
      expect(res.body.data).toHaveProperty('isPaused');
      expect(res.body.data).toHaveProperty('counts');
      expect(res.body.data.counts).toHaveProperty('waiting');
      expect(res.body.data.counts).toHaveProperty('active');
      expect(res.body.data.counts).toHaveProperty('completed');
      expect(res.body.data.counts).toHaveProperty('failed');
      expect(res.body.data.counts).toHaveProperty('delayed');

      expect(typeof res.body.data.counts.waiting).toBe('number');
      expect(typeof res.body.data.counts.active).toBe('number');
      expect(typeof res.body.data.counts.completed).toBe('number');
      expect(typeof res.body.data.counts.failed).toBe('number');
      expect(typeof res.body.data.counts.delayed).toBe('number');
    });

    it('returns isPaused as boolean', async () => {
      const res = await request(app).get('/api/v1/monitoring/queues').expect(200);

      expect(typeof res.body.data.isPaused).toBe('boolean');
    });
  });

  describe('GET /api/v1/monitoring/workers', () => {
    it('returns worker metrics', async () => {
      const res = await request(app).get('/api/v1/monitoring/workers').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('workers');
      expect(Array.isArray(res.body.data.workers)).toBe(true);
      expect(res.body.data.workers.length).toBeGreaterThanOrEqual(1);

      const worker = res.body.data.workers[0];
      expect(worker).toHaveProperty('id');
      expect(worker).toHaveProperty('name', 'notification-worker');
      expect(worker).toHaveProperty('status');
      expect(['running', 'stopped', 'paused']).toContain(worker.status);
      expect(worker).toHaveProperty('concurrency');
      expect(worker).toHaveProperty('isRunning');
      expect(worker).toHaveProperty('queueCounts');
      expect(worker.queueCounts).toHaveProperty('waiting');
      expect(worker.queueCounts).toHaveProperty('active');
      expect(worker.queueCounts).toHaveProperty('completed');
      expect(worker.queueCounts).toHaveProperty('failed');
      expect(worker).toHaveProperty('processUptimeSeconds');
      expect(worker).toHaveProperty('processedTotal');
      expect(worker).toHaveProperty('failedTotal');
    });

    it('processedTotal and failedTotal match queue-level counts', async () => {
      const queuesRes = await request(app).get('/api/v1/monitoring/queues').expect(200);
      const workersRes = await request(app).get('/api/v1/monitoring/workers').expect(200);

      expect(workersRes.body.data.workers[0].processedTotal).toBe(queuesRes.body.data.counts.completed);
      expect(workersRes.body.data.workers[0].failedTotal).toBe(queuesRes.body.data.counts.failed);
    });
  });
});