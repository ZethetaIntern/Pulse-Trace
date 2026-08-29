import { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useOverview } from '../hooks/useOverview';
import { MetricCard } from '../components/analytics/MetricCard';
import { Card, PageHeader, Button, StatusDot, LoadingSkeleton } from '../components/ui';
import { classifyCheckStatus, formatCheckStatus, resolveStatusTone } from '../components/ui/status';
import type { StatusTone } from '../components/ui/status';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import type {
  ChannelStatisticsResponse,
  DashboardMetricsResponse,
  MonitoringHealthResponse,
  PaginatedNotificationsResponse,
  QueueMetricsResponse,
} from '../types';
import type { Channel, NotificationStatus, Priority } from '../types';

type MetricsQuery = UseQueryResult<DashboardMetricsResponse, Error>;
type ChannelsQuery = UseQueryResult<ChannelStatisticsResponse, Error>;
type HealthQuery = UseQueryResult<MonitoringHealthResponse, Error>;
type QueueQuery = UseQueryResult<QueueMetricsResponse, Error>;
type NotificationsQuery = UseQueryResult<PaginatedNotificationsResponse, Error>;

const TONE_TEXT: Record<StatusTone, string> = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  error: 'text-error-text',
  info: 'text-info-text',
  neutral: 'text-ink',
};

const CHANNEL_LABEL: Record<Channel, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  IN_APP: 'In-app',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

const STATUS_ACTIVITY: Record<NotificationStatus, string> = {
  CREATED: 'created',
  QUEUED: 'queued',
  PROCESSING: 'is being processed',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  RETRY_PENDING: 'is pending retry',
  DLQ: 'was moved to the dead-letter queue',
  SKIPPED: 'skipped',
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

/** Relative time from real timestamps. */
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

function sumChannelStat(channels: ChannelStatisticsResponse['channels'], key: 'delivered' | 'failed') {
  return channels.reduce((acc, ch) => acc + ch[key], 0);
}

// ============================================================
// System health banner (compact)
// ============================================================

function HealthBanner({ health }: { health: HealthQuery }) {
  if (health.isLoading) {
    return (
      <div className="rounded-card border border-line bg-surface px-4 py-2.5">
        <LoadingSkeleton rows={1} />
      </div>
    );
  }

  if (health.isError || !health.data) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-2.5">
        <span className="text-[13px] text-ink-muted">System health is currently unavailable.</span>
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
        : 'Systems unhealthy';

  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot status={overall} size="md" />
        <div className="min-w-0">
          <p className={`text-[13px] font-medium ${TONE_TEXT[tone]}`}>{headline}</p>
          <p className="truncate text-meta text-ink-faint">API · PostgreSQL · Redis · Queue · Worker</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="rounded bg-neutral-soft px-1.5 py-0.5 text-[10px] font-medium text-neutral-text">
          {health.data.environment}
        </span>
        <Link to="/monitoring" className="text-[13px] font-medium text-primary hover:text-primary-hover transition-colors">
          View monitoring →
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// KPI grid (compact)
// ============================================================

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
    <div className="bg-surface px-3.5 py-2">
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div className={`mt-0.5 text-[15px] font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-card border border-line bg-surface p-3.5">
            <LoadingSkeleton rows={2} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-surface px-3.5 py-2">
            <LoadingSkeleton rows={1} />
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiGrid({ metrics }: { metrics: MetricsQuery }) {
  if (metrics.isError) {
    return (
      <div className="rounded-card border border-line bg-surface px-4 py-12">
        <ErrorState
          title="Unable to load metrics"
          message="Could not load notification metrics."
          onRetry={metrics.refetch}
        />
      </div>
    );
  }

  if (metrics.isLoading || !metrics.data) {
    return <KpiSkeleton />;
  }

  const m = metrics.data;
  const empty = m.totalNotifications === 0;
  const channelCount = Object.keys(m.channelBreakdown).length;

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          compact
          label="Total Notifications"
          value={m.totalNotifications}
          subtitle={`Across ${channelCount} ${channelCount === 1 ? 'channel' : 'channels'}`}
        />
        <MetricCard
          compact
          label="Success Rate"
          value={empty ? '—' : `${m.successRate}%`}
          variant={empty || m.successRate === 0 ? 'default' : 'success'}
          subtitle={empty ? 'No deliveries yet' : undefined}
        />
        <MetricCard
          compact
          label="Failure Rate"
          value={empty ? '—' : `${m.failureRate}%`}
          variant={empty || m.failureRate === 0 ? 'default' : 'danger'}
          subtitle={empty ? 'No deliveries yet' : undefined}
        />
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
        <StatCell
          label="Retries"
          value={m.retryCount}
          valueClass={m.retryCount > 0 ? 'text-warning-text' : 'text-ink'}
        />
        <StatCell
          label="In DLQ"
          value={m.dlqCount}
          valueClass={m.dlqCount > 0 ? 'text-error-text' : 'text-ink'}
        />
        <StatCell label="Channels" value={channelCount} />
      </div>
    </div>
  );
}

// ============================================================
// Operational snapshot
// ============================================================

function DeliveryOverview({ channels, queue }: { channels: ChannelsQuery; queue: QueueQuery }) {
  const missing = !channels.data && !queue.data;
  const bothFailed = channels.isError && queue.isError;
  const someFailed = (channels.isError || queue.isError) && !bothFailed;

  const delivered = channels.data ? sumChannelStat(channels.data.channels, 'delivered') : null;
  const failed = channels.data ? sumChannelStat(channels.data.channels, 'failed') : null;
  const queued = queue.data ? queue.data.counts.waiting : null;
  const processing = queue.data ? queue.data.counts.active : null;

  return (
    <Card title="Delivery Overview" subtitle="Across all channels and the notification queue">
      {missing && bothFailed && (
        <div className="py-5">
          <ErrorState
            title="Unable to load delivery overview"
            message="Could not load channel and queue metrics."
            onRetry={() => {
              channels.refetch();
              queue.refetch();
            }}
          />
        </div>
      )}
      {missing && !bothFailed && (
        <div className="py-3">
          <LoadingSkeleton rows={3} />
        </div>
      )}
      {!missing && (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line">
            <StatCell
              label="Delivered"
              value={delivered ?? '—'}
              valueClass={delivered && delivered > 0 ? 'text-success-text' : 'text-ink'}
            />
            <StatCell
              label="Failed"
              value={failed ?? '—'}
              valueClass={failed && failed > 0 ? 'text-error-text' : 'text-ink'}
            />
            <StatCell label="Queued" value={queued ?? '—'} />
            <StatCell label="Processing" value={processing ?? '—'} />
          </div>
          {someFailed && (
            <div className="mt-2 flex items-center justify-between text-meta text-ink-faint">
              <span>Some metrics are temporarily unavailable.</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  channels.refetch();
                  queue.refetch();
                }}
              >
                Retry
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function HealthRow({ label, check }: { label: string; check: { status: string; latencyMs?: number } }) {
  const classified = classifyCheckStatus(check.status);
  const tone = resolveStatusTone(classified);

  return (
    <div className="flex items-center justify-between border-b border-line py-1.5 last:border-0">
      <div className="flex items-center gap-2">
        <StatusDot status={classified} />
        <span className="text-[13px] font-medium text-ink">{label}</span>
      </div>
      <div className="text-right">
        <div className={`text-[13px] font-medium ${TONE_TEXT[tone]}`}>{formatCheckStatus(check.status)}</div>
        {check.latencyMs !== undefined && <div className="text-[11px] text-ink-faint">{check.latencyMs}ms</div>}
      </div>
    </div>
  );
}

function SystemComponents({ health }: { health: HealthQuery }) {
  return (
    <Card title="System Components" subtitle="Dependency health checks">
      {health.isLoading && <LoadingSkeleton rows={4} />}
      {health.isError && (
        <div className="py-5">
          <ErrorState
            title="Unable to load system health"
            message="Could not load dependency health."
            onRetry={health.refetch}
          />
        </div>
      )}
      {!health.isLoading && !health.isError && health.data && (
        <div className="space-y-0">
          <HealthRow label="API" check={health.data.checks.api} />
          <HealthRow label="PostgreSQL" check={health.data.checks.postgres} />
          <HealthRow label="Redis" check={health.data.checks.redis} />
          <HealthRow label="Queue" check={health.data.checks.queue} />
          <HealthRow label="Worker" check={health.data.checks.worker} />
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Recent activity
// ============================================================

function RecentActivity({ notifications, now }: { notifications: NotificationsQuery; now: number }) {
  return (
    <Card
      title="Recent Activity"
      subtitle="Latest notifications across all channels"
      action={
        <Link to="/notifications" className="text-[13px] font-medium text-primary hover:text-primary-hover transition-colors">
          View all →
        </Link>
      }
    >
      {notifications.isLoading && <LoadingSkeleton rows={4} />}
      {notifications.isError && (
        <div className="py-5">
          <ErrorState
            title="Unable to load recent activity"
            message="Could not load recent notifications."
            onRetry={notifications.refetch}
          />
        </div>
      )}
      {!notifications.isLoading &&
        !notifications.isError &&
        notifications.data?.items.length === 0 && (
          <EmptyState
            compact
            title="No notification activity yet"
            message="Notifications will appear here once the system processes them."
          />
        )}
      {!notifications.isLoading &&
        !notifications.isError &&
        notifications.data &&
        notifications.data.items.length > 0 && (
          <ul className="divide-y divide-line">
            {notifications.data.items.map((notification) => (
              <li key={notification.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <StatusDot status={notification.status} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-ink">
                      Notification {STATUS_ACTIVITY[notification.status]}
                    </p>
                    <p className="truncate text-[11px] text-ink-faint">
                      {CHANNEL_LABEL[notification.channel]} · {PRIORITY_LABEL[notification.priority]}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-ink-muted">
                  {formatRelativeTime(notification.createdAt, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}

// ============================================================
// Page
// ============================================================

export function OverviewPage() {
  const { metrics, channels, health, queue, notifications, refetchAll, refreshing, lastUpdated } =
    useOverview();
  const now = useNow();

  const updatedLabel = lastUpdated > 0 ? `Updated ${formatRelativeTime(lastUpdated, now)}` : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Overview"
        description="System health and notification delivery at a glance."
        actions={
          <div className="flex items-center gap-2.5">
            {updatedLabel && <span className="text-[11px] text-ink-faint">{updatedLabel}</span>}
            <Button variant="secondary" size="sm" onClick={refetchAll} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        }
      />

      <HealthBanner health={health} />

      <KpiGrid metrics={metrics} />

      <div className="grid gap-4 lg:grid-cols-2">
        <DeliveryOverview channels={channels} queue={queue} />
        <SystemComponents health={health} />
      </div>

      <RecentActivity notifications={notifications} now={now} />
    </div>
  );
}