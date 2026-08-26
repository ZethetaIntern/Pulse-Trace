import { MonitoringRepository } from '../../monitoring/interfaces/monitoring-repository';
import { ReadinessService, ReadinessResponse } from '../interfaces/readiness-service';
import { isShuttingDown } from '../../../lifecycle/shutdown-state';

export class ReadinessServiceImpl implements ReadinessService {
  constructor(private readonly repository: MonitoringRepository) {}

  async getReadiness(): Promise<ReadinessResponse> {
    // If shutdown has started, immediately return not_ready
    if (isShuttingDown()) {
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          postgres: { status: 'error', latencyMs: 0 },
          redis: { status: 'error', latencyMs: 0 },
          queue: { status: 'error', latencyMs: 0 },
          worker: { status: 'error', latencyMs: 0 },
        },
      };
    }

    const [postgresCheck, redisCheck, queueCheck, workerCheck] = await Promise.all([
      this.repository.checkPostgres(),
      this.repository.checkRedis(),
      this.repository.checkQueue(),
      this.repository.checkWorker(),
    ]);

    const checks = {
      postgres: postgresCheck,
      redis: redisCheck,
      queue: queueCheck,
      worker: workerCheck,
    };

    // Ready only if ALL required dependencies are healthy
    // For readiness, we treat 'paused' queue and 'stopped' worker as not ready
    const allHealthy = Object.values(checks).every(
      (c) => c.status === 'ok'
    );

    return {
      status: allHealthy ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}