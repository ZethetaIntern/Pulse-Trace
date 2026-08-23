import { AnalyticsService } from '../../../../modules/analytics/services/analytics-service';
import { AnalyticsRepository, DashboardMetrics, TrendBucket, ChannelStat } from '../../../../modules/analytics/interfaces/analytics-repository';

function createMockRepository(): AnalyticsRepository {
  return {
    getDashboardMetrics: jest.fn(),
    getDeliveryTrends: jest.fn(),
    getChannelStatistics: jest.fn(),
  };
}

describe('AnalyticsService', () => {
  describe('getDashboardMetrics', () => {
    it('returns transformed dashboard metrics', async () => {
      const mockRepo = createMockRepository();
      const metrics: DashboardMetrics = {
        totalNotifications: 100,
        deliveredCount: 90,
        failedCount: 5,
        dlqCount: 5,
        retryCount: 10,
        channelBreakdown: { EMAIL: 60, SMS: 40 },
      };
      (mockRepo.getDashboardMetrics as jest.Mock).mockResolvedValue(metrics);

      const service = new AnalyticsService(mockRepo);
      const result = await service.getDashboardMetrics();

      expect(result.totalNotifications).toBe(100);
      expect(result.successRate).toBe(90);
      expect(result.failureRate).toBe(10);
      expect(result.retryCount).toBe(10);
      expect(result.dlqCount).toBe(5);
      expect(result.channelBreakdown).toEqual({ EMAIL: 60, SMS: 40 });
      expect(mockRepo.getDashboardMetrics).toHaveBeenCalled();
    });

    it('handles zero notifications', async () => {
      const mockRepo = createMockRepository();
      (mockRepo.getDashboardMetrics as jest.Mock).mockResolvedValue({
        totalNotifications: 0,
        deliveredCount: 0,
        failedCount: 0,
        dlqCount: 0,
        retryCount: 0,
        channelBreakdown: {},
      });

      const service = new AnalyticsService(mockRepo);
      const result = await service.getDashboardMetrics();

      expect(result.successRate).toBe(0);
      expect(result.failureRate).toBe(0);
    });
  });

  describe('getDeliveryTrends', () => {
    it('returns transformed delivery trends', async () => {
      const mockRepo = createMockRepository();
      const from = new Date('2026-08-01');
      const to = new Date('2026-08-31');
      const buckets: TrendBucket[] = [
        { date: '2026-08-01T00:00:00.000Z', created: 10, delivered: 8, failed: 2, retried: 1 },
      ];
      (mockRepo.getDeliveryTrends as jest.Mock).mockResolvedValue(buckets);

      const service = new AnalyticsService(mockRepo);
      const result = await service.getDeliveryTrends({ from, to, interval: 'day' });

      expect(result.interval).toBe('day');
      expect(result.buckets).toHaveLength(1);
      expect(result.buckets[0].created).toBe(10);
      expect(result.buckets[0].delivered).toBe(8);
      expect(result.buckets[0].failed).toBe(2);
      expect(result.buckets[0].retried).toBe(1);
      expect(mockRepo.getDeliveryTrends).toHaveBeenCalledWith({ from, to, interval: 'day' });
    });

    it('handles empty buckets', async () => {
      const mockRepo = createMockRepository();
      (mockRepo.getDeliveryTrends as jest.Mock).mockResolvedValue([]);

      const service = new AnalyticsService(mockRepo);
      const result = await service.getDeliveryTrends({
        from: new Date(),
        to: new Date(),
        interval: 'hour',
      });

      expect(result.buckets).toEqual([]);
    });
  });

  describe('getChannelStatistics', () => {
    it('returns transformed channel statistics', async () => {
      const mockRepo = createMockRepository();
      const channels: ChannelStat[] = [
        { channel: 'EMAIL', total: 100, delivered: 95, failed: 5, successRate: 95 },
        { channel: 'SMS', total: 50, delivered: 48, failed: 2, successRate: 96 },
      ];
      (mockRepo.getChannelStatistics as jest.Mock).mockResolvedValue(channels);

      const service = new AnalyticsService(mockRepo);
      const result = await service.getChannelStatistics();

      expect(result.channels).toHaveLength(2);
      expect(result.channels[0].channel).toBe('EMAIL');
      expect(result.channels[0].successRate).toBe(95);
      expect(result.channels[1].channel).toBe('SMS');
      expect(result.channels[1].successRate).toBe(96);
      expect(mockRepo.getChannelStatistics).toHaveBeenCalled();
    });

    it('handles empty channels', async () => {
      const mockRepo = createMockRepository();
      (mockRepo.getChannelStatistics as jest.Mock).mockResolvedValue([]);

      const service = new AnalyticsService(mockRepo);
      const result = await service.getChannelStatistics();

      expect(result.channels).toEqual([]);
    });
  });
});
