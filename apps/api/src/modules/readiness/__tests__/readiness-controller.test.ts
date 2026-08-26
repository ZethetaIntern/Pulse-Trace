import { Request, Response, NextFunction } from 'express';
import { ReadinessController } from '../controllers/readiness-controller';
import { ReadinessService } from '../interfaces/readiness-service';
import { ReadinessResponse } from '../interfaces/readiness-service';

const mockNext: NextFunction = jest.fn();

const createMockResponse = () => {
  const res: Partial<Response> = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

const createMockReadiness = (overrides: Partial<ReadinessResponse> = {}): ReadinessResponse => ({
  status: 'ready',
  timestamp: new Date().toISOString(),
  checks: {
    postgres: { status: 'ok', latencyMs: 5 },
    redis: { status: 'ok', latencyMs: 3 },
    queue: { status: 'ok', latencyMs: 2 },
    worker: { status: 'ok', latencyMs: 1 },
  },
  ...overrides,
});

describe('ReadinessController', () => {
  let controller: ReadinessController;
  let mockService: jest.Mocked<ReadinessService>;
  let mockReq: Partial<Request>;
  let mockRes: Response;

  beforeEach(() => {
    mockService = {
      getReadiness: jest.fn(),
    };
    controller = new ReadinessController(mockService);
    mockReq = {};
    mockRes = createMockResponse();
  });

  it('returns 200 with ready status when all checks pass', async () => {
    mockService.getReadiness.mockResolvedValue(createMockReadiness());

    await controller.getReadiness(mockReq as Request, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Application is ready',
      data: expect.objectContaining({
        status: 'ready',
        timestamp: expect.any(String),
        checks: expect.objectContaining({
          postgres: { status: 'ok', latencyMs: 5 },
          redis: { status: 'ok', latencyMs: 3 },
          queue: { status: 'ok', latencyMs: 2 },
          worker: { status: 'ok', latencyMs: 1 },
        }),
      }),
    });
  });

  it('returns 503 with not_ready status when postgres fails', async () => {
    mockService.getReadiness.mockResolvedValue(
      createMockReadiness({
        status: 'not_ready',
        checks: {
          postgres: { status: 'error', latencyMs: 100 },
          redis: { status: 'ok', latencyMs: 3 },
          queue: { status: 'ok', latencyMs: 2 },
          worker: { status: 'ok', latencyMs: 1 },
        },
      })
    );

    await controller.getReadiness(mockReq as Request, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      message: 'Application is not ready',
      data: expect.objectContaining({
        status: 'not_ready',
        checks: expect.objectContaining({
          postgres: { status: 'error', latencyMs: 100 },
        }),
      }),
    });
  });

  it('returns 503 with not_ready status when redis fails', async () => {
    mockService.getReadiness.mockResolvedValue(
      createMockReadiness({
        status: 'not_ready',
        checks: {
          postgres: { status: 'ok', latencyMs: 5 },
          redis: { status: 'error', latencyMs: 100 },
          queue: { status: 'ok', latencyMs: 2 },
          worker: { status: 'ok', latencyMs: 1 },
        },
      })
    );

    await controller.getReadiness(mockReq as Request, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(503);
  });

  it('returns 503 with not_ready status when queue is paused', async () => {
    mockService.getReadiness.mockResolvedValue(
      createMockReadiness({
        status: 'not_ready',
        checks: {
          postgres: { status: 'ok', latencyMs: 5 },
          redis: { status: 'ok', latencyMs: 3 },
          queue: { status: 'paused', latencyMs: 2 },
          worker: { status: 'ok', latencyMs: 1 },
        },
      })
    );

    await controller.getReadiness(mockReq as Request, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(503);
  });

  it('returns 503 with not_ready status when worker is stopped', async () => {
    mockService.getReadiness.mockResolvedValue(
      createMockReadiness({
        status: 'not_ready',
        checks: {
          postgres: { status: 'ok', latencyMs: 5 },
          redis: { status: 'ok', latencyMs: 3 },
          queue: { status: 'ok', latencyMs: 2 },
          worker: { status: 'stopped', latencyMs: 1 },
        },
      })
    );

    await controller.getReadiness(mockReq as Request, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(503);
  });

  it('includes latency in all checks', async () => {
    mockService.getReadiness.mockResolvedValue(createMockReadiness());

    await controller.getReadiness(mockReq as Request, mockRes, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          checks: expect.objectContaining({
            postgres: expect.objectContaining({ latencyMs: expect.any(Number) }),
            redis: expect.objectContaining({ latencyMs: expect.any(Number) }),
            queue: expect.objectContaining({ latencyMs: expect.any(Number) }),
            worker: expect.objectContaining({ latencyMs: expect.any(Number) }),
          }),
        }),
      })
    );
  });
});