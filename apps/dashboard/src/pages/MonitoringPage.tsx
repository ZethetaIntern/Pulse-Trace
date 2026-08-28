import { useMonitoringHealth } from '../hooks/useMonitoring';
import { useQueueMetrics } from '../hooks/useMonitoring';
import { useWorkerMetrics } from '../hooks/useMonitoring';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { StatusBadge } from '../components/StatusBadge';
import { PageHeader, Button, StatusDot } from '../components/ui';
import type { InfrastructureStatus } from '../components/ui/status';

function classifyCheckStatus(status: string): InfrastructureStatus {
  if (status === 'ok') return 'healthy';
  if (status === 'paused') return 'degraded';
  if (status === 'stopped') return 'stopped';
  return 'error';
}

function classifyWorkerStatus(status: string): InfrastructureStatus {
  if (status === 'running') return 'running';
  if (status === 'paused') return 'degraded';
  if (status === 'stopped') return 'stopped';
  return 'error';
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function HealthCheckCard({ label, check }: { label: string; check: { status: string; latencyMs?: number } }) {
  const isOk = check.status === 'ok';
  const isDegraded = check.status === 'paused';
  const isStopped = check.status === 'stopped';

  return (
    <div className="flex items-center justify-between border-b border-line py-2 last:border-0">
      <div className="flex items-center gap-2">
        <StatusDot status={classifyCheckStatus(check.status)} />
        <span className="text-sm font-medium text-ink">{label}</span>
      </div>
      <div className="text-right">
        <div className={`text-sm font-medium ${isOk ? 'text-success-text' : isDegraded || isStopped ? 'text-warning-text' : 'text-error-text'}`}>
          {check.status === 'ok' ? 'Healthy' : check.status === 'paused' ? 'Paused' : check.status === 'stopped' ? 'Stopped' : 'Error'}
        </div>
        {check.latencyMs !== undefined && (
          <div className="text-xs text-ink-muted">{check.latencyMs}ms</div>
        )}
      </div>
    </div>
  );
}

function HealthSection() {
  const { data: health, isLoading, isError, error, refetch } = useMonitoringHealth();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <LoadingSpinner message="Checking system health..." />
      </div>
    );
  }

  if (isError || !health) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-sm font-medium text-red-700">Failed to load health</span>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {error instanceof Error ? error.message : 'Could not load system health'}
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const overallStatus = health.status;
  const statusColors = {
    healthy: 'bg-success',
    degraded: 'bg-warning',
    unhealthy: 'bg-error',
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-900">System Health</h3>
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${statusColors[overallStatus as keyof typeof statusColors] || 'bg-gray-500'}`} />
          <span className="text-sm font-medium capitalize text-gray-900">{overallStatus}</span>
        </div>
      </div>
      <dl className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <dt className="text-gray-500">Uptime</dt>
          <dd className="font-medium text-gray-900">{formatUptime(health.uptime)}</dd>
        </div>
        <div className="flex justify-between text-sm">
          <dt className="text-gray-500">Version</dt>
          <dd className="font-medium text-gray-900">{health.version}</dd>
        </div>
        <div className="flex justify-between text-sm">
          <dt className="text-gray-500">Environment</dt>
          <dd className="font-medium text-gray-900">{health.environment}</dd>
        </div>
      </dl>
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Component Checks</h4>
        <div className="space-y-0">
          <HealthCheckCard label="API" check={health.checks.api} />
          <HealthCheckCard label="PostgreSQL" check={health.checks.postgres} />
          <HealthCheckCard label="Redis" check={health.checks.redis} />
          <HealthCheckCard label="Queue" check={health.checks.queue} />
          <HealthCheckCard label="Worker" check={health.checks.worker} />
        </div>
      </div>
    </div>
  );
}

function QueueSection() {
  const { data: queue, isLoading, isError, error, refetch } = useQueueMetrics();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <LoadingSpinner message="Loading queue metrics..." />
      </div>
    );
  }

  if (isError || !queue) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-sm font-medium text-red-700">Failed to load queue metrics</span>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {error instanceof Error ? error.message : 'Could not load queue metrics'}
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-ink">Queue: {queue.queueName}</h3>
        <StatusBadge status={queue.isPaused ? 'degraded' : 'running'} />
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs text-gray-500">Waiting</dt>
          <dd className="mt-1 text-2xl font-semibold text-gray-900">{queue.counts.waiting}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Active</dt>
          <dd className="mt-1 text-2xl font-semibold text-blue-700">{queue.counts.active}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Completed</dt>
          <dd className="mt-1 text-2xl font-semibold text-green-700">{queue.counts.completed}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Failed</dt>
          <dd className="mt-1 text-2xl font-semibold text-red-700">{queue.counts.failed}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Delayed</dt>
          <dd className="mt-1 text-2xl font-semibold text-amber-700">{queue.counts.delayed}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-gray-500">Total Processed</dt>
          <dd className="mt-1 text-lg font-medium text-gray-900">{queue.counts.completed + queue.counts.failed}</dd>
        </div>
      </dl>
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Queue-level counts. Processed/failed totals reflect all workers combined.
        </p>
      </div>
    </div>
  );
}

function WorkerSection() {
  const { data: workers, isLoading, isError, error, refetch } = useWorkerMetrics();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <LoadingSpinner message="Loading worker metrics..." />
      </div>
    );
  }

  if (isError || !workers) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-sm font-medium text-red-700">Failed to load worker metrics</span>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {error instanceof Error ? error.message : 'Could not load worker metrics'}
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-medium text-gray-900 mb-4">Workers</h3>
      <div className="space-y-4">
        {workers.workers.map((worker) => (
          <div key={worker.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-ink">{worker.name}</span>
                <StatusBadge status={classifyWorkerStatus(worker.status)} />
              </div>
              <div className="text-right text-xs text-gray-500">
                <div>PID: {worker.id.split('-').pop()}</div>
                <div>Uptime: {formatUptime(worker.processUptimeSeconds)}</div>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">Concurrency</dt>
                <dd className="font-medium text-gray-900">{worker.concurrency}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Running</dt>
                <dd className={`font-medium ${worker.isRunning ? 'text-green-700' : 'text-red-700'}`}>
                  {worker.isRunning ? 'Yes' : 'No'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd className="font-medium capitalize text-gray-900">{worker.status}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Waiting</dt>
                <dd className="font-medium text-gray-900">{worker.queueCounts.waiting}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Active</dt>
                <dd className="font-medium text-blue-700">{worker.queueCounts.active}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Completed</dt>
                <dd className="font-medium text-green-700">{worker.queueCounts.completed}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Failed</dt>
                <dd className="font-medium text-red-700">{worker.queueCounts.failed}</dd>
              </div>
              <div className="col-span-3">
                <dt className="text-gray-500">Processed Total (queue-level)</dt>
                <dd className="font-medium text-gray-900">{worker.processedTotal}</dd>
              </div>
              <div className="col-span-3">
                <dt className="text-gray-500">Failed Total (queue-level)</dt>
                <dd className="font-medium text-red-700">{worker.failedTotal}</dd>
              </div>
            </dl>
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Processed/failed totals are queue-level aggregates, not per-worker. Uptime is process uptime.
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonitoringPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring"
        description="Real-time queue and worker health metrics."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <HealthSection />
        <QueueSection />
      </div>
      <WorkerSection />
    </div>
  );
}