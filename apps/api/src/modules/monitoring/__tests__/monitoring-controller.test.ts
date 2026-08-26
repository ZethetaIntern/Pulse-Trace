import { Request, Response, NextFunction } from 'express';
import { MonitoringController } from '../controllers/monitoring-controller';
import { MonitoringService } from '../interfaces/monitoring-service';
import { SystemHealth } from '../interfaces/monitoring-service';
import { QueueMetrics } from '../repositories/bullmq-monitoring-repository';
import { WorkerMetrics } from '../repositories/bullmq-monitoring-repository';

const createMockResponse = () => {
  const res: Partial<Response> = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

const mockNext: NextFunction = jest.fn();

const createMockHealth = (overrides: Partial<SystemHealth> = {}): SystemHealth => ({
  status: 'healthy',
  timestamp: new Date().toISOString(),
  uptime: 3600,
  version: '1.0.0',
  environment: 'test',
  checks: {
    api: { status: 'ok', latencyMs: 1 },
    postgres: { status: 'ok', latencyMs: 5 },
    redis: { status: 'ok', latencyMs: 3 },
    queue: { status: 'ok', latencyMs: 2 },
    worker: { status: 'ok', latencyMs: 1 },
  },
  ...overrides,
});

const createMockQueueMetrics = (overrides: Partial<QueueMetrics> = {}): QueueMetrics => ({
  queueName: 'notifications',
  isPaused: false,
  counts: { waiting: 10, active: 2, completed: 100, failed: 5, delayed: 3 },
  ...overrides,
});

const createMockWorkerMetrics = (overrides: Partial<WorkerMetrics> = {}): WorkerMetrics => ({
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
  ...overrides,
});

describe('MonitoringController', () => {
  let controller: MonitoringController;
  let mockService: jest.Mocked<MonitoringService>;
  let mockReq: Partial<Request>;
  let mockRes: Response;

  beforeEach(() => {
    mockService = {
      getSystemHealth: jest.fn(),
      getQueueMetrics: jest.fn(),
      getWorkerMetrics: jest.fn(),
    };
    controller = new MonitoringController(mockService);
    mockReq = {};
    mockRes = createMockResponse();
  });

  describe('getHealth', () => {
    it('returns health response with success true', async () => {
      mockService.getSystemHealth.mockResolvedValue(createMockHealth());

      await controller.getHealth(mockReq as Request, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'System health retrieved',
        data: {
          status: 'healthy',
          timestamp: expect.any(String),
          uptime: 3600,
          version: '1.0.0',
          environment: 'test',
          checks: {
            api: { status: 'ok', latencyMs: 1 },
            postgres: { status: 'ok', latencyMs: 5 },
            redis: { status: 'ok', latencyMs: 3 },
            queue: { status: 'ok', latencyMs: 2 },
            worker: { status: 'ok', latencyMs: 1 },
          },
        },
      });
    });

    it('returns degraded status when queue is paused', async () => {
      mockService.getSystemHealth.mockResolvedValue(
        createMockHealth({
          status: 'degraded',
          checks: {
            api: { status: 'ok', latencyMs: 1 },
            postgres: { status: 'ok', latencyMs: 5 },
            redis: { status: 'ok', latencyMs: 3 },
            queue: { status: 'paused', latencyMs: 2 },
            worker: { status: 'ok', latencyMs: 1 },
          },
        })
      );

      await controller.getHealth(mockReq as Request, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'degraded',
            checks: expect.objectContaining({
              queue: { status: 'paused', latencyMs: 2 },
            }),
          }),
        })
      );
    });

    it('returns unhealthy status when postgres fails', async () => {
      mockService.getSystemHealth.mockResolvedValue(
        createMockHealth({
          status: 'unhealthy',
          checks: {
            api: { status: 'ok', latencyMs: 1 },
            postgres: { status: 'error', latencyMs: 100 },
            redis: { status: 'ok', latencyMs: 3 },
            queue: { status: 'ok', latencyMs: 2 },
            worker: { status: 'ok', latencyMs: 1 },
          },
        })
      );

      await controller.getHealth(mockReq as Request, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'unhealthy',
            checks: expect.objectContaining({
              postgres: { status: 'error', latencyMs: 100 },
            }),
          }),
        })
      );
    });
  });

  describe('getQueueMetrics', () => {
    it('returns queue metrics response with success true', async () => {
      mockService.getQueueMetrics.mockResolvedValue(createMockQueueMetrics());

      await controller.getQueueMetrics(mockReq as Request, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Queue metrics retrieved',
        data: {
          queueName: 'notifications',
          isPaused: false,
          counts: {
            waiting: 10,
            active: 2,
            completed: 100,
            failed: 5,
            delayed: 3,
          },
        },
      });
    });

    it('returns paused true when queue is paused', async () => {
      mockService.getQueueMetrics.mockResolvedValue(
        createMockQueueMetrics({ isPaused: true })
      );

      await controller.getQueueMetrics(mockReq as Request, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPaused: true,
          }),
        })
      );
    });
  });

  describe('getWorkerMetrics', () => {
    it('returns worker metrics response with success true', async () => {
      mockService.getWorkerMetrics.mockResolvedValue(createMockWorkerMetrics());

      await controller.getWorkerMetrics(mockReq as Request, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Worker metrics retrieved',
        data: {
          workers: [
            {
              id: 'notification-worker-12345',
              name: 'notification-worker',
              status: 'running',
              concurrency: 1,
              isRunning: true,
              queueCounts: {
                waiting: 10,
                active: 2,
                completed: 100,
                failed: 5,
              },
              processUptimeSeconds: 3600,
              processedTotal: 100,
              failedTotal: 5,
            },
          ],
        },
      });
    });

    it('returns stopped status when worker is not running', async () => {
      mockService.getWorkerMetrics.mockResolvedValue(
        createMockWorkerMetrics({
          workers: [
            {
              id: 'notification-worker-12345',
              name: 'notification-worker',
              status: 'stopped',
              concurrency: 1,
              isRunning: false,
              queueCounts: { waiting: 0, active: 0, completed: 0, failed: 0 },
              processUptimeSeconds: 3600,
              processedTotal: 0,
              failedTotal: 0,
            },
          ],
        })
      );

      await controller.getWorkerMetrics(mockReq as Request, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workers: expect.arrayContaining([
              expect.objectContaining({
                status: 'stopped',
                isRunning: false,
              }),
            ]),
          }),
        })
      );
    });
  });
});