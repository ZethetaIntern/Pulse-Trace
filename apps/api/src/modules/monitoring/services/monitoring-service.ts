import { env } from '../../../config/env';
import { MonitoringService, SystemHealth, HealthCheckResult } from '../interfaces/monitoring-service';
import { MonitoringRepository } from '../interfaces/monitoring-repository';

export class MonitoringServiceImpl implements MonitoringService {
  constructor(private readonly repository: MonitoringRepository) {}

  async getSystemHealth(): Promise<SystemHealth> {
    const [apiCheck, postgresCheck, redisCheck, queueCheck, workerCheck] = await Promise.all([
      this.checkApi(),
      this.repository.checkPostgres(),
      this.repository.checkRedis(),
      this.repository.checkQueue(),
      this.repository.checkWorker(),
    ]);

    const checks: HealthCheckResult = {
      api: apiCheck,
      postgres: postgresCheck,
      redis: redisCheck,
      queue: queueCheck,
      worker: workerCheck,
    };

    const hasError = Object.values(checks).some((c) => c.status === 'error');
    const hasDegraded = Object.values(checks).some((c) => c.status === 'paused' || c.status === 'stopped');

    let status: SystemHealth['status'] = 'healthy';
    if (hasError) status = 'unhealthy';
    else if (hasDegraded) status = 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: env.nodeEnv,
      checks,
    };
  }

  private async checkApi(): Promise<{ status: 'ok' | 'error'; latencyMs?: number }> {
    const start = Date.now();
    try {
      await Promise.resolve();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch {
      return { status: 'error', latencyMs: Date.now() - start };
    }
  }

  async getQueueMetrics() {
    return this.repository.getQueueMetrics();
  }

  async getWorkerMetrics() {
    return this.repository.getWorkerMetrics();
  }
}