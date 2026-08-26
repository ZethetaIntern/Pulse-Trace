import { SystemHealth } from '../interfaces/monitoring-service';
import { QueueMetrics, WorkerMetrics } from '../repositories/bullmq-monitoring-repository';

export interface MonitoringHealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    api: { status: string; latencyMs?: number };
    postgres: { status: string; latencyMs?: number };
    redis: { status: string; latencyMs?: number };
    queue: { status: string; latencyMs?: number };
    worker: { status: string; latencyMs?: number };
  };
}

export interface QueueMetricsResponse {
  queueName: string;
  isPaused: boolean;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
}

export interface WorkerMetricsResponse {
  workers: Array<{
    id: string;
    name: string;
    status: string;
    concurrency: number;
    isRunning: boolean;
    queueCounts: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
    processUptimeSeconds: number;
    processedTotal: number;
    failedTotal: number;
  }>;
}

export function toMonitoringHealthResponse(health: SystemHealth): MonitoringHealthResponse {
  return {
    status: health.status,
    timestamp: health.timestamp,
    uptime: health.uptime,
    version: health.version,
    environment: health.environment,
    checks: {
      api: health.checks.api,
      postgres: health.checks.postgres,
      redis: health.checks.redis,
      queue: health.checks.queue,
      worker: health.checks.worker,
    },
  };
}

export function toQueueMetricsResponse(metrics: QueueMetrics): QueueMetricsResponse {
  return {
    queueName: metrics.queueName,
    isPaused: metrics.isPaused,
    counts: metrics.counts,
  };
}

export function toWorkerMetricsResponse(metrics: WorkerMetrics): WorkerMetricsResponse {
  return {
    workers: metrics.workers.map((w) => ({
      id: w.id,
      name: w.name,
      status: w.status,
      concurrency: w.concurrency,
      isRunning: w.isRunning,
      queueCounts: w.queueCounts,
      processUptimeSeconds: w.processUptimeSeconds,
      processedTotal: w.processedTotal,
      failedTotal: w.failedTotal,
    })),
  };
}