import {
  ChannelStat,
  DashboardMetrics,
  TrendBucket,
} from '../interfaces/analytics-repository';

// ============================================================
// Dashboard Metrics Response
// ============================================================

export interface DashboardMetricsResponse {
  totalNotifications: number;
  successRate: number;
  failureRate: number;
  retryCount: number;
  dlqCount: number;
  channelBreakdown: Record<string, number>;
}

export function toDashboardMetricsResponse(
  metrics: DashboardMetrics,
): DashboardMetricsResponse {
  const { totalNotifications, deliveredCount, failedCount, dlqCount, retryCount, channelBreakdown } =
    metrics;

  const successRate =
    totalNotifications > 0
      ? Math.round((deliveredCount / totalNotifications) * 1000) / 10
      : 0;

  const failureRate =
    totalNotifications > 0
      ? Math.round(((failedCount + dlqCount) / totalNotifications) * 1000) / 10
      : 0;

  return {
    totalNotifications,
    successRate,
    failureRate,
    retryCount,
    dlqCount,
    channelBreakdown,
  };
}

// ============================================================
// Delivery Trends Response
// ============================================================

export interface TrendBucketResponse {
  date: string;
  created: number;
  delivered: number;
  failed: number;
  retried: number;
}

export interface DeliveryTrendsResponse {
  interval: string;
  from: string;
  to: string;
  buckets: TrendBucketResponse[];
}

export function toDeliveryTrendsResponse(
  interval: string,
  from: Date,
  to: Date,
  buckets: TrendBucket[],
): DeliveryTrendsResponse {
  return {
    interval,
    from: from.toISOString(),
    to: to.toISOString(),
    buckets: buckets.map((b) => ({
      date: b.date,
      created: b.created,
      delivered: b.delivered,
      failed: b.failed,
      retried: b.retried,
    })),
  };
}

// ============================================================
// Channel Statistics Response
// ============================================================

export interface ChannelStatResponse {
  channel: string;
  total: number;
  delivered: number;
  failed: number;
  successRate: number;
}

export interface ChannelStatisticsResponse {
  channels: ChannelStatResponse[];
}

export function toChannelStatisticsResponse(
  channels: ChannelStat[],
): ChannelStatisticsResponse {
  return {
    channels: channels.map((ch) => ({
      channel: ch.channel,
      total: ch.total,
      delivered: ch.delivered,
      failed: ch.failed,
      successRate: ch.successRate,
    })),
  };
}
