import { QueueMetrics } from '../repositories/bullmq-monitoring-repository';
import { WorkerMetrics } from '../repositories/bullmq-monitoring-repository';

export interface HealthCheckResult {
  api: { status: 'ok' | 'error'; latencyMs?: number };
  postgres: { status: 'ok' | 'error'; latencyMs?: number };
  redis: { status: 'ok' | 'error'; latencyMs?: number };
  queue: { status: 'ok' | 'error' | 'paused'; latencyMs?: number };
  worker: { status: 'ok' | 'error' | 'stopped'; latencyMs?: number };
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: HealthCheckResult;
}

export interface MonitoringService {
  getSystemHealth(): Promise<SystemHealth>;
  getQueueMetrics(): Promise<QueueMetrics>;
  getWorkerMetrics(): Promise<WorkerMetrics>;
}