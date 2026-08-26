export interface ReadinessChecks {
  postgres: { status: 'ok' | 'error'; latencyMs?: number };
  redis: { status: 'ok' | 'error'; latencyMs?: number };
  queue: { status: 'ok' | 'error' | 'paused'; latencyMs?: number };
  worker: { status: 'ok' | 'error' | 'stopped'; latencyMs?: number };
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: ReadinessChecks;
}

export interface ReadinessService {
  getReadiness(): Promise<ReadinessResponse>;
}