import { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMonitoringHealth, useQueueMetrics, useWorkerMetrics } from '../hooks/useMonitoring';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { StatusBadge } from '../components/StatusBadge';
import { Button, Card, LoadingSkeleton, PageHeader, StatusDot } from '../components/ui';
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

/** Ticking clock for live "Updated Xs ago" timestamps. */
function useNow(intervalMs = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Relative time from real timestamps (no fabricated values). */
function formatRelativeTime(time: number | string, now: number): string {
  const ts = typeof time === 'string' ? new Date(time).getTime() : time;
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

/** Labeled metric cell, joined by 1px hairlines inside a bordered grid. */
function StatCell({
  label,
  value,
  valueClass = 'text-ink',
}: {
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <div className="bg-surface px-4 py-2.5">
      <div className="text-meta text-ink-muted">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

// ============================================================
// Overall health banner
// ============================================================

function HealthBanner({ health }: { health: HealthQuery }) {
  if (health.isLoading) {
    return (
      <div className="rounded-container border border-line bg-surface p-4">
        <LoadingSkeleton rows={2} />
      </div>
    );
  }

  if (health.isError || !health.data) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-container border border-line bg-surface p-4">
        <p className="text-sm text-ink">System health is currently unavailable.</p>
        <Button variant="secondary" size="sm" onClick={() => health.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const overall = classifyOverallStatus(health.data.status);
  const tone = resolveStatusTone(overall);
  const headline =
    overall === 'healthy'
      ? 'All systems operational'
      : overall === 'degraded'
        ? 'Some systems degraded'
        : 'System health requires attention';

  return (
    <div className="flex flex-col gap-3 rounded-container border border-line bg-surface p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <StatusDot status={overall} size="md" />
        <div className="min-w-0">
          <p className={`text-sm font-medium ${TONE_TEXT[tone]}`}>{headline}</p>
          <p className="truncate text-meta text-ink-muted">API · PostgreSQL · Redis · Queue · Worker</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-neutral-soft px-2 py-0.5 text-xs font-medium text-neutral-text">
          {health.data.environment}
        </span>
        <span className="text-meta text-ink-faint">Uptime {formatUptime(health.data.uptime)}</span>
      </div>
    </div>
  );
}

// ============================================================
// System components
// ============================================================

function ComponentCell({ label, check }: { label: string; check: { status: string; latencyMs?: number } }) {
  const status = classifyCheckStatus(check.status);
  const tone = resolveStatusTone(status);

  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-meta text-ink-muted">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <StatusDot status={status} />
        <span className={`text-sm font-medium ${TONE_TEXT[tone]}`}>{formatCheckStatus(check.status)}</span>
      </div>
      {check.latencyMs !== undefined && (
        <p className="mt-0.5 text-meta text-ink-faint">{check.latencyMs}ms latency</p>
      )}
    </div>
  );
}

function SystemComponents({ health }: { health: HealthQuery }) {
  return (
    <Card title="System Components" subtitle="Dependency health checks">
      {health.isLoading && <LoadingSkeleton rows={5} />}
      {health.isError && (
        <div className="py-4">
          <ErrorState
            title="Unable to load system health"
            message="Could not load dependency health."
            onRetry={health.refetch}
          />
        </div>
      )}
      {!health.isLoading && !health.isError && health.data && (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-control border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          <ComponentCell label="API" check={health.data.checks.api} />
          <ComponentCell label="PostgreSQL" check={health.data.checks.postgres} />
          <ComponentCell label="Redis" check={health.data.checks.redis} />
          <ComponentCell label="Queue" check={health.data.checks.queue} />
          <ComponentCell label="Worker" check={health.data.checks.worker} />
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Queue operations
// ============================================================

function QueueOperations({ queue }: { queue: QueueQuery }) {
  return (
    <Card
      title="Queue operations"
      subtitle={queue.data?.queueName ? `Queue: ${queue.data.queueName}` : undefined}
      action={queue.data ? <StatusBadge status={queue.data.isPaused ? 'degraded' : 'running'} /> : undefined}
    >
      {queue.isLoading && <LoadingSkeleton rows={4} />}
      {queue.isError && (
        <div className="py-4">
          <ErrorState
            title="Unable to load queue metrics"
            message="Could not load queue metrics."
            onRetry={queue.refetch}
          />
        </div>
      )}
      {!queue.isLoading && !queue.isError && queue.data && !queue.data.queueName && (
        <EmptyState
          compact
          title="No queue data available"
          message="Queue metrics will appear once the notification queue is available."
        />
      )}
      {!queue.isLoading && !queue.isError && queue.data && queue.data.queueName && (
        <>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-meta font-medium uppercase tracking-wide text-ink-faint">Current depth</p>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line sm:grid-cols-3">
                <StatCell label="Waiting" value={queue.data.counts.waiting} />
                <StatCell label="Active" value={queue.data.counts.active} />
                <StatCell label="Delayed" value={queue.data.counts.delayed} />
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-meta font-medium uppercase tracking-wide text-ink-faint">Cumulative totals</p>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line">
                <StatCell label="Completed" value={queue.data.counts.completed} />
                <StatCell
                  label="Failed"
                  value={queue.data.counts.failed}
                  valueClass={queue.data.counts.failed > 0 ? 'text-error-text' : 'text-ink'}
                />
              </div>
            </div>
          </div>
          <p className="mt-4 border-t border-line pt-3 text-meta text-ink-faint">
            Waiting, active and delayed reflect the current queue depth. Completed and failed are cumulative totals.
          </p>
        </>
      )}
    </Card>
  );
}

// ============================================================
// Workers
// ============================================================

function WorkerRow({ worker }: { worker: WorkerMetricsItemResponse }) {
  const status = classifyWorkerStatus(worker.status);

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={status} />
          <span className="truncate font-mono text-sm text-ink">{worker.name}</span>
          <StatusBadge status={status} size="sm" />
        </div>
        <span className="shrink-0 text-meta text-ink-muted">Uptime {formatUptime(worker.processUptimeSeconds)}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        <StatCell label="Concurrency" value={worker.concurrency} />
        <StatCell label="Waiting" value={worker.queueCounts.waiting} />
        <StatCell label="Active" value={worker.queueCounts.active} />
        <StatCell label="Completed" value={worker.queueCounts.completed} />
        <StatCell
          label="Failed"
          value={worker.queueCounts.failed}
          valueClass={worker.queueCounts.failed > 0 ? 'text-error-text' : 'text-ink'}
        />
      </div>
      <p className="mt-2 text-meta text-ink-faint">
        Waiting, active, completed and failed are queue-level counts reported alongside this worker, not per-process
        totals.
      </p>
    </li>
  );
}

function WorkersSection({ workers }: { workers: WorkersQuery }) {
  return (
    <Card title="Workers" subtitle="Worker process status and queue snapshot">
      {workers.isLoading && <LoadingSkeleton rows={4} />}
      {workers.isError && (
        <div className="py-4">
          <ErrorState
            title="Unable to load worker status"
            message="Could not load worker status."
            onRetry={workers.refetch}
          />
        </div>
      )}
      {!workers.isLoading && !workers.isError && workers.data && workers.data.workers.length === 0 && (
        <EmptyState
          compact
          title="No workers reported"
          message="No worker processes have reported metrics yet. Workers appear here once they start; this is not a failure."
        />
      )}
      {!workers.isLoading && !workers.isError && workers.data && workers.data.workers.length > 0 && (
        <ul className="divide-y divide-line">
          {workers.data.workers.map((worker) => (
            <WorkerRow key={worker.id} worker={worker} />
          ))}
        </ul>
      )}
    </Card>
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
    .map((query) => query.dataUpdatedAt)
    .filter((t) => t > 0)
    .reduce((max, t) => Math.max(max, t), 0);

  const updatedLabel = updatedAt > 0 ? `Updated ${formatRelativeTime(updatedAt, now)}` : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Monitoring"
        description="System health, queue activity, and worker status."
        actions={
          <div className="flex items-center gap-3">
            {updatedLabel && <span className="text-meta text-ink-faint">{updatedLabel}</span>}
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