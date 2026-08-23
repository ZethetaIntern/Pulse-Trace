/**
 * Data-access contract for the analytics module.
 * All Prisma/database access is hidden behind this interface.
 */
export interface DashboardMetrics {
  totalNotifications: number;
  deliveredCount: number;
  failedCount: number;
  dlqCount: number;
  retryCount: number;
  channelBreakdown: Record<string, number>;
}

export interface TrendBucket {
  date: string;
  created: number;
  delivered: number;
  failed: number;
  retried: number;
}

export interface TrendQuery {
  from: Date;
  to: Date;
  interval: 'hour' | 'day' | 'week' | 'month';
}

export interface ChannelStat {
  channel: string;
  total: number;
  delivered: number;
  failed: number;
  successRate: number;
}

export interface AnalyticsRepository {
  getDashboardMetrics(): Promise<DashboardMetrics>;
  getDeliveryTrends(query: TrendQuery): Promise<TrendBucket[]>;
  getChannelStatistics(): Promise<ChannelStat[]>;
}
