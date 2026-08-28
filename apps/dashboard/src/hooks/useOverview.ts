import { useCallback, useMemo, useState } from 'react';
import { useChannelStatistics, useDashboardMetrics } from './useAnalytics';
import { useMonitoringHealth, useQueueMetrics } from './useMonitoring';
import { useNotifications } from './useNotifications';

/**
 * Composes every Overview data source using the same query keys as the
 * dedicated pages, so caches are shared across the app. A single Refresh
 * re-fetches all Overview queries; `lastUpdated` reflects the newest
 * successful fetch from real react-query state (no fake timestamps).
 */
export function useOverview() {
  const [refreshing, setRefreshing] = useState(false);

  const metrics = useDashboardMetrics();
  const channels = useChannelStatistics();
  const health = useMonitoringHealth();
  const queue = useQueueMetrics();
  const notifications = useNotifications({
    page: 1,
    limit: 5,
    sort: 'createdAt',
    order: 'desc',
  });

  const refetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        metrics.refetch(),
        channels.refetch(),
        health.refetch(),
        queue.refetch(),
        notifications.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [metrics.refetch, channels.refetch, health.refetch, queue.refetch, notifications.refetch]);

  const lastUpdated = useMemo(() => {
    const stamps = [metrics, channels, health, queue, notifications]
      .map((query) => query.dataUpdatedAt)
      .filter((t) => t > 0);
    return stamps.length > 0 ? Math.max(...stamps) : 0;
  }, [metrics, channels, health, queue, notifications]);

  return {
    metrics,
    channels,
    health,
    queue,
    notifications,
    refetchAll,
    refreshing,
    lastUpdated,
  };
}