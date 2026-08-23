import {
  DashboardMetrics,
  TrendBucket,
  ChannelStat,
} from '../../../../modules/analytics/interfaces/analytics-repository';
import {
  toDashboardMetricsResponse,
  toDeliveryTrendsResponse,
  toChannelStatisticsResponse,
} from '../../../../modules/analytics/dto/analytics-response';

describe('toDashboardMetricsResponse', () => {
  it('calculates success rate correctly', () => {
    const metrics: DashboardMetrics = {
      totalNotifications: 100,
      deliveredCount: 95,
      failedCount: 3,
      dlqCount: 2,
      retryCount: 10,
      channelBreakdown: { EMAIL: 60, SMS: 40 },
    };

    const result = toDashboardMetricsResponse(metrics);

    expect(result.totalNotifications).toBe(100);
    expect(result.successRate).toBe(95); // 95/100 = 95%
    expect(result.failureRate).toBe(5);  // (3+2)/100 = 5%
    expect(result.retryCount).toBe(10);
    expect(result.dlqCount).toBe(2);
    expect(result.channelBreakdown).toEqual({ EMAIL: 60, SMS: 40 });
  });

  it('handles zero notifications', () => {
    const metrics: DashboardMetrics = {
      totalNotifications: 0,
      deliveredCount: 0,
      failedCount: 0,
      dlqCount: 0,
      retryCount: 0,
      channelBreakdown: {},
    };

    const result = toDashboardMetricsResponse(metrics);

    expect(result.successRate).toBe(0);
    expect(result.failureRate).toBe(0);
    expect(result.totalNotifications).toBe(0);
  });

  it('rounds rates to one decimal place', () => {
    const metrics: DashboardMetrics = {
      totalNotifications: 3,
      deliveredCount: 1,
      failedCount: 1,
      dlqCount: 1,
      retryCount: 0,
      channelBreakdown: {},
    };

    const result = toDashboardMetricsResponse(metrics);

    // 1/3 = 0.333... → 33.3%
    expect(result.successRate).toBe(33.3);
    // (1+1)/3 = 0.666... → 66.7%
    expect(result.failureRate).toBe(66.7);
  });

  it('includes all required fields', () => {
    const metrics: DashboardMetrics = {
      totalNotifications: 10,
      deliveredCount: 8,
      failedCount: 1,
      dlqCount: 1,
      retryCount: 2,
      channelBreakdown: { EMAIL: 10 },
    };

    const result = toDashboardMetricsResponse(metrics);

    const expectedKeys = [
      'totalNotifications', 'successRate', 'failureRate',
      'retryCount', 'dlqCount', 'channelBreakdown',
    ];
    expect(Object.keys(result).sort()).toEqual(expectedKeys.sort());
  });
});

describe('toDeliveryTrendsResponse', () => {
  it('maps buckets correctly', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-31T00:00:00.000Z');
    const buckets: TrendBucket[] = [
      { date: '2026-08-01T00:00:00.000Z', created: 10, delivered: 8, failed: 2, retried: 1 },
      { date: '2026-08-02T00:00:00.000Z', created: 15, delivered: 14, failed: 1, retried: 0 },
    ];

    const result = toDeliveryTrendsResponse('day', from, to, buckets);

    expect(result.interval).toBe('day');
    expect(result.from).toBe('2026-08-01T00:00:00.000Z');
    expect(result.to).toBe('2026-08-31T00:00:00.000Z');
    expect(result.buckets).toHaveLength(2);
    expect(result.buckets[0]).toEqual({
      date: '2026-08-01T00:00:00.000Z',
      created: 10,
      delivered: 8,
      failed: 2,
      retried: 1,
    });
  });

  it('handles empty buckets', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-31T00:00:00.000Z');

    const result = toDeliveryTrendsResponse('day', from, to, []);

    expect(result.buckets).toEqual([]);
    expect(result.interval).toBe('day');
  });

  it('preserves all bucket fields', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-02T00:00:00.000Z');
    const buckets: TrendBucket[] = [
      { date: '2026-08-01T00:00:00.000Z', created: 5, delivered: 3, failed: 2, retried: 1 },
    ];

    const result = toDeliveryTrendsResponse('hour', from, to, buckets);
    const bucket = result.buckets[0];

    expect(Object.keys(bucket).sort()).toEqual(['created', 'date', 'delivered', 'failed', 'retried']);
  });
});

describe('toChannelStatisticsResponse', () => {
  it('maps channel statistics correctly', () => {
    const channels: ChannelStat[] = [
      { channel: 'EMAIL', total: 100, delivered: 95, failed: 5, successRate: 95 },
      { channel: 'SMS', total: 50, delivered: 48, failed: 2, successRate: 96 },
    ];

    const result = toChannelStatisticsResponse(channels);

    expect(result.channels).toHaveLength(2);
    expect(result.channels[0]).toEqual({
      channel: 'EMAIL', total: 100, delivered: 95, failed: 5, successRate: 95,
    });
    expect(result.channels[1]).toEqual({
      channel: 'SMS', total: 50, delivered: 48, failed: 2, successRate: 96,
    });
  });

  it('handles empty channels', () => {
    const result = toChannelStatisticsResponse([]);
    expect(result.channels).toEqual([]);
  });

  it('preserves all channel fields', () => {
    const channels: ChannelStat[] = [
      { channel: 'IN_APP', total: 10, delivered: 10, failed: 0, successRate: 100 },
    ];

    const result = toChannelStatisticsResponse(channels);
    const ch = result.channels[0];

    expect(Object.keys(ch).sort()).toEqual(['channel', 'delivered', 'failed', 'successRate', 'total']);
  });
});
