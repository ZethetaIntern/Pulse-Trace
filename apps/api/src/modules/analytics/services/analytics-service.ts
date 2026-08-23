import { AnalyticsRepository, TrendQuery } from '../interfaces/analytics-repository';
import {
  ChannelStatisticsResponse,
  DashboardMetricsResponse,
  DeliveryTrendsResponse,
  toChannelStatisticsResponse,
  toDashboardMetricsResponse,
  toDeliveryTrendsResponse,
} from '../dto/analytics-response';

/**
 * Application/business logic for analytics.
 * Coordinates repository operations; performs no HTTP or database access itself.
 */
export class AnalyticsService {
  constructor(private readonly repository: AnalyticsRepository) {}

  /**
   * Returns dashboard summary metrics: total notifications, success/failure
   * rates, retry count, DLQ count, and channel breakdown.
   */
  async getDashboardMetrics(): Promise<DashboardMetricsResponse> {
    const metrics = await this.repository.getDashboardMetrics();
    return toDashboardMetricsResponse(metrics);
  }

  /**
   * Returns time-bucketed delivery trends using PostgreSQL-side date_trunc.
   */
  async getDeliveryTrends(query: TrendQuery): Promise<DeliveryTrendsResponse> {
    const buckets = await this.repository.getDeliveryTrends(query);
    return toDeliveryTrendsResponse(query.interval, query.from, query.to, buckets);
  }

  /**
   * Returns per-channel statistics: total, delivered, failed, success rate.
   */
  async getChannelStatistics(): Promise<ChannelStatisticsResponse> {
    const channels = await this.repository.getChannelStatistics();
    return toChannelStatisticsResponse(channels);
  }
}
