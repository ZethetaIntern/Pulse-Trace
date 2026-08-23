import { Request, Response } from 'express';
import { sendSuccess } from '../../../shared/utils/response';
import { AnalyticsService } from '../services/analytics-service';
import { validateTrendsQuery } from '../validators/analytics-validator';

/**
 * HTTP layer for analytics. Only parses requests, validates input, calls
 * the service and formats responses. No business logic or database access.
 */
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  /**
   * GET /api/v1/analytics/dashboard
   */
  async getDashboardMetrics(_req: Request, res: Response): Promise<void> {
    const data = await this.service.getDashboardMetrics();
    sendSuccess(res, data, 'Dashboard metrics retrieved successfully');
  }

  /**
   * GET /api/v1/analytics/trends
   */
  async getDeliveryTrends(req: Request, res: Response): Promise<void> {
    const query = validateTrendsQuery(req.query);
    const data = await this.service.getDeliveryTrends(query);
    sendSuccess(res, data, 'Delivery trends retrieved successfully');
  }

  /**
   * GET /api/v1/analytics/channels
   */
  async getChannelStatistics(_req: Request, res: Response): Promise<void> {
    const data = await this.service.getChannelStatistics();
    sendSuccess(res, data, 'Channel statistics retrieved successfully');
  }
}
