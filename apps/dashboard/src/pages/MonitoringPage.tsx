import { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMonitoringHealth, useQueueMetrics, useWorkerMetrics } from '../hooks/useMonitoring';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { StatusBadge } from '../components/StatusBadge';
import { Button, LoadingSkeleton, PageHeader, StatusDot } from '../components/ui';
import {
  classifyCheckStatus,
  classifyWorkerStatus,
  formatCheckStatus,
  resolveStatusTone,
} from '../components/ui/status';
import type { StatusTone } from '../components/ui/status';
import type {
  MonitoringHealthResponse,
  QueueMetricsResponse,
  WorkerMetricsItemResponse,
  WorkerMetricsResponse,
} from '../types';

type HealthQuery = UseQueryResult<MonitoringHealthResponse, Error>;
type QueueQuery = UseQueryResult<QueueMetricsResponse, Error>;
type WorkersQuery = UseQueryResult<WorkerMetricsResponse, Error>;

const TONE_TEXT: Record<StatusTone, string> = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  error: 'text-error-text',
  info: 'text-info-text',
  neutral: 'text-ink',
};

function useNow(intervalMs = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatRelativeTime(time: number | string, now: number): string {
  const ts = typeof time === 'string' ? new Date(time).getTime() : time;
  if (!Number.isFinite(ts)) return '—';
  const diffMs = Math.max(0, now - ts);
  const s = Math.floor(diffMs / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function classifyOverallStatus(status: string): 'healthy' | 'degraded' | 'error' {
  if (status === 'healthy') return 'healthy';
  if (status === 'degraded') return 'degraded';
  return 'error';
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function StatCell({ label, value, valueClass = 'text-ink' }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="bg-surface px-3.5 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`mt-0.5 text-[15px] font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

// ============================================================
// Health banner — compact strip
// ============================================================

function HealthBanner({ health }: { health: HealthQuery }) {
  if (health.isLoading) {
    return <div className="rounded-card border border-line bg-surface px-4 py-2"><LoadingSkeleton rows={1} /></div>;
  }

  if (health.isError || !health.data) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-2">
        <p className="text-[13px] text-ink-muted">System health is currently unavailable.</p>
        <Button variant="secondary" size="sm" onClick={() => health.refetch()}>Retry</Button>
      </div>
    );
  }

  const overall = classifyOverallStatus(health.data.status);
  const tone = resolveStatusTone(overall);
  const headline = overall === 'healthy' ? 'All systems operational' : overall === 'degraded' ? 'Some systems degraded' : 'System health requires attention';

  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot status={overall} size="md" />
        <div className="min-w-0">
          <p className={`text-[13px] font-medium ${TONE_TEXT[tone]}`}>{headline}</p>
          <p className="truncate text-[11px] text-ink-faint">API · PostgreSQL · Redis · Queue · Worker</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded bg-neutral-soft px-1.5 py-0.5 text-[10px] font-medium text-neutral-text">{health.data.environment}</span>
        <span className="text-[11px] text-ink-faint">Uptime {formatUptime(health.data.uptime)}</span>
      </div>
    </div>
  );
}

// ============================================================
// System components — 5 compact cells
// ============================================================

function ComponentCell({ label, check }: { label: string; check: { status: string; latencyMs?: number } }) {
  const status = classifyCheckStatus(check.status);
  const tone = resolveStatusTone(status);

  return (
    <div className="bg-surface px-3.5 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">{label}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        <StatusDot status={status} />
        <span className={`text-[13px] font-medium ${TONE_TEXT[tone]}`}>{formatCheckStatus(check.status)}</span>
      </div>
      {check.latencyMs !== undefined && <p className="mt-0.5 text-[11px] text-ink-faint">{check.latencyMs}ms</p>}
    </div>
  );
}

function SystemComponents({ health }: { health: HealthQuery }) {
  return (
    <div className="rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-section-title text-ink">System Components</h2>
        <span className="text-[11px] text-ink-faint">Dependency health checks</span>
      </div>
      {health.isLoading && <div className="px-4 py-3"><LoadingSkeleton rows={3} /></div>}
      {health.isError && <div className="px-4 py-3"><ErrorState title="Unable to load system health" message="Could not load dependency health." onRetry={health.refetch} /></div>}
      {!health.isLoading && !health.isError && health.data && (
        <div className="grid grid-cols-1 gap-px overflow-hidden bg-line sm:grid-cols-2 lg:grid-cols-5">
          <ComponentCell label="API" check={health.data.checks.api} />
          <ComponentCell label="PostgreSQL" check={health.data.checks.postgres} />
          <ComponentCell label="Redis" check={health.data.checks.redis} />
          <ComponentCell label="Queue" check={health.data.checks.queue} />
          <ComponentCell label="Worker" check={health.data.checks.worker} />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Queue operations — dense metrics
// ============================================================

function QueueOperations({ queue }: { queue: QueueQuery }) {
  return (
    <div className="rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div>
          <h2 className="text-section-title text-ink">Queue Operations</h2>
          {queue.data?.queueName && <p className="mt-0.5 text-[11px] text-ink-faint">Queue: {queue.data.queueName}</p>}
        </div>
        {queue.data && <StatusBadge status={queue.data.isPaused ? 'degraded' : 'running'} />}
      </div>

      {queue.isLoading && <div className="px-4 py-3"><LoadingSkeleton rows={3} /></div>}
      {queue.isError && <div className="px-4 py-3"><ErrorState title="Unable to load queue metrics" message="Could not load queue metrics." onRetry={queue.refetch} /></div>}
      {!queue.isLoading && !queue.isError && queue.data && !queue.data.queueName && (
        <EmptyState compact title="No queue data available" message="Queue metrics will appear once the notification queue is available." />
      )}
      {!queue.isLoading && !queue.isError && queue.data && queue.data.queueName && (
        <div className="divide-y divide-line">
          <div className="px-4 py-3">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">Current Depth</p>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line sm:grid-cols-3">
              <StatCell label="Waiting" value={queue.data.counts.waiting} />
              <StatCell label="Active" value={queue.data.counts.active} />
              <StatCell label="Delayed" value={queue.data.counts.delayed} />
            </div>
          </div>
          <div className="px-4 py-3">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">Cumulative Totals</p>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line">
              <StatCell label="Completed" value={queue.data.counts.completed} />
              <StatCell label="Failed" value={queue.data.counts.failed} valueClass={queue.data.counts.failed > 0 ? 'text-error-text' : 'text-ink'} />
            </div>
          </div>
          <div className="px-4 py-2">
            <p className="text-[11px] text-ink-faint">Waiting, active and delayed reflect the current queue depth. Completed and failed are cumulative totals.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Workers — dense operational rows
// ============================================================

function WorkerRow({ worker }: { worker: WorkerMetricsItemResponse }) {
  const status = classifyWorkerStatus(worker.status);

  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={status} />
          <span className="truncate font-mono text-[13px] text-ink">{worker.name}</span>
          <StatusBadge status={status} size="sm" />
        </div>
        <span className="shrink-0 text-[11px] text-ink-muted">Uptime {formatUptime(worker.processUptimeSeconds)}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        <StatCell label="Concurrency" value={worker.concurrency} />
        <StatCell label="Waiting" value={worker.queueCounts.waiting} />
        <StatCell label="Active" value={worker.queueCounts.active} />
        <StatCell label="Completed" value={worker.queueCounts.completed} />
        <StatCell label="Failed" value={worker.queueCounts.failed} valueClass={worker.queueCounts.failed > 0 ? 'text-error-text' : 'text-ink'} />
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">
        Waiting, active, completed and failed are queue-level counts reported alongside this worker.
      </p>
    </li>
  );
}

function WorkersSection({ workers }: { workers: WorkersQuery }) {
  return (
    <div className="rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-section-title text-ink">Workers</h2>
        <span className="text-[11px] text-ink-faint">Worker process status and queue snapshot</span>
      </div>
      {workers.isLoading && <div className="px-4 py-3"><LoadingSkeleton rows={3} /></div>}
      {workers.isError && <div className="px-4 py-3"><ErrorState title="Unable to load worker status" message="Could not load worker status." onRetry={workers.refetch} /></div>}
      {!workers.isLoading && !workers.isError && workers.data && workers.data.workers.length === 0 && (
        <EmptyState compact title="No workers reported" message="No worker processes have reported metrics yet." />
      )}
      {!workers.isLoading && !workers.isError && workers.data && workers.data.workers.length > 0 && (
        <div className="divide-y divide-line px-4 py-2.5">
          <ul className="space-y-3">
            {workers.data.workers.map((worker) => (
              <WorkerRow key={worker.id} worker={worker} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Page
// ============================================================

export function MonitoringPage() {
  const health = useMonitoringHealth();
  const queue = useQueueMetrics();
  const workers = useWorkerMetrics();
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([health.refetch(), queue.refetch(), workers.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const updatedAt = [health, queue, workers]
    .map((q) => q.dataUpdatedAt)
    .filter((t) => t > 0)
    .reduce((max, t) => Math.max(max, t), 0);

  const updatedLabel = updatedAt > 0 ? `Updated ${formatRelativeTime(updatedAt, now)}` : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Monitoring"
        description="System health, queue activity, and worker status."
        actions={
          <div className="flex items-center gap-2.5">
            {updatedLabel && <span className="text-[11px] text-ink-faint">{updatedLabel}</span>}
            <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        }
      />
      <HealthBanner health={health} />
      <SystemComponents health={health} />
      <QueueOperations queue={queue} />
      <WorkersSection workers={workers} />
    </div>
  );
}
