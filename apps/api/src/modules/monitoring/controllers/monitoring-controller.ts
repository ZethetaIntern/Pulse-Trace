import { Request, Response } from 'express';
import { MonitoringService } from '../interfaces/monitoring-service';
import { asyncHandler } from '../../../shared/utils/async-handler';
import {
  toMonitoringHealthResponse,
  toQueueMetricsResponse,
  toWorkerMetricsResponse,
} from '../dto/monitoring-response';

export class MonitoringController {
  constructor(private readonly service: MonitoringService) {}

  getHealth = asyncHandler(async (_req: Request, res: Response) => {
    const health = await this.service.getSystemHealth();
    res.json({
      success: true,
      message: 'System health retrieved',
      data: toMonitoringHealthResponse(health),
    });
  });

  getQueueMetrics = asyncHandler(async (_req: Request, res: Response) => {
    const metrics = await this.service.getQueueMetrics();
    res.json({
      success: true,
      message: 'Queue metrics retrieved',
      data: toQueueMetricsResponse(metrics),
    });
  });

  getWorkerMetrics = asyncHandler(async (_req: Request, res: Response) => {
    const metrics = await this.service.getWorkerMetrics();
    res.json({
      success: true,
      message: 'Worker metrics retrieved',
      data: toWorkerMetricsResponse(metrics),
    });
  });
}