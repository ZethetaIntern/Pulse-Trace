import { useQuery } from '@tanstack/react-query';
import {
  getMonitoringHealth,
  getQueueMetrics,
  getWorkerMetrics,
} from '../api/client';
import type {
  MonitoringHealthResponse,
  QueueMetricsResponse,
  WorkerMetricsResponse,
} from '../types';

export function useMonitoringHealth() {
  return useQuery<MonitoringHealthResponse>({
    queryKey: ['monitoring', 'health'],
    queryFn: getMonitoringHealth,
    refetchInterval: 10_000,
  });
}

export function useQueueMetrics() {
  return useQuery<QueueMetricsResponse>({
    queryKey: ['monitoring', 'queues'],
    queryFn: getQueueMetrics,
    refetchInterval: 10_000,
  });
}

export function useWorkerMetrics() {
  return useQuery<WorkerMetricsResponse>({
    queryKey: ['monitoring', 'workers'],
    queryFn: getWorkerMetrics,
    refetchInterval: 10_000,
  });
}