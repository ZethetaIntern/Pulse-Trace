import { QueueMetrics, WorkerMetrics } from '../repositories/bullmq-monitoring-repository';

export interface MonitoringRepository {
  checkPostgres(): Promise<{ status: 'ok' | 'error'; latencyMs: number }>;
  checkRedis(): Promise<{ status: 'ok' | 'error'; latencyMs: number }>;
  checkQueue(): Promise<{ status: 'ok' | 'error' | 'paused'; latencyMs: number }>;
  checkWorker(): Promise<{ status: 'ok' | 'error' | 'stopped'; latencyMs: number }>;
  getQueueMetrics(): Promise<QueueMetrics>;
  getWorkerMetrics(): Promise<WorkerMetrics>;
  close(): Promise<void>;
}