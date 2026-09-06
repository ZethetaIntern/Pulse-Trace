import { useCallback, useMemo, useState } from 'react';
import { useDashboardMetrics } from './useAnalytics';
import { useMonitoringHealth } from './useMonitoring';
import { useNotifications } from './useNotifications';

/**
 * Composes Overview data sources using the same query keys as the
 * dedicated pages, so caches are shared across the app. A single Refresh
 * re-fetches all Overview queries; `lastUpdated` reflects the newest
 * successful fetch from real react-query state (no fake timestamps).
 */
export function useOverview() {
  const [refreshing, setRefreshing] = useState(false);

  const metrics = useDashboardMetrics();
  const health = useMonitoringHealth();
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
        health.refetch(),
        notifications.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [metrics.refetch, health.refetch, notifications.refetch]);

  const lastUpdated = useMemo(() => {
    const stamps = [metrics, health, notifications]
      .map((query) => query.dataUpdatedAt)
      .filter((t) => t > 0);
    return stamps.length > 0 ? Math.max(...stamps) : 0;
  }, [metrics, health, notifications]);

  return {
    metrics,
    health,
    notifications,
    refetchAll,
    refreshing,
    lastUpdated,
  };
}