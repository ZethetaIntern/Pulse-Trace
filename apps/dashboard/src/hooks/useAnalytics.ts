import { useQuery } from '@tanstack/react-query';
import {
  getChannelStatistics,
  getDashboardMetrics,
  getDeliveryTrends,
} from '../api/client';
import type { TrendQueryParams } from '../types';

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: getDashboardMetrics,
    refetchInterval: 30_000,
  });
}

export function useDeliveryTrends(params?: TrendQueryParams) {
  return useQuery({
    queryKey: ['analytics', 'trends', params],
    queryFn: () => getDeliveryTrends(params),
  });
}

export function useChannelStatistics() {
  return useQuery({
    queryKey: ['analytics', 'channels'],
    queryFn: getChannelStatistics,
  });
}
