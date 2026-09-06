import type { UseQueryResult } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useOverview } from '../hooks/useOverview';
import { MetricCard } from '../components/analytics/MetricCard';
import { PageHeader, Button, StatusDot, LoadingSkeleton } from '../components/ui';
import { resolveStatusTone } from '../components/ui/status';
import type { StatusTone } from '../components/ui/status';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { useNow, formatRelativeTime } from '../lib/time';
import type {
  DashboardMetricsResponse,
  MonitoringHealthResponse,
  PaginatedNotificationsResponse,
} from '../types';
import type { Channel, NotificationStatus, Priority } from '../types';

type MetricsQuery = UseQueryResult<DashboardMetricsResponse, Error>;
type HealthQuery = UseQueryResult<MonitoringHealthResponse, Error>;
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

function classifyOverallStatus(status: string): 'healthy' | 'degraded' | 'error' {
  if (status === 'healthy') return 'healthy';
  if (status === 'degraded') return 'degraded';
  return 'error';
}

// ============================================================
// System health summary — concise, high-signal
// ============================================================

function HealthBanner({ health }: { health: HealthQuery }) {
  if (health.isLoading) {
    return (
      <div className="rounded-card border border-line bg-surface px-4 py-2">
        <LoadingSkeleton rows={1} />
      </div>
    );
  }

  if (health.isError || !health.data) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-2">
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
    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot status={overall} size="md" />
        <div className="min-w-0">
          <p className={`text-[13px] font-medium ${TONE_TEXT[tone]}`}>{headline}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded bg-neutral-soft px-1.5 py-0.5 text-[10px] font-medium text-neutral-text">
          {health.data.environment}
        </span>
        <Link to="/monitoring" className="text-[12px] font-medium text-primary hover:text-primary-hover transition-colors">
          View monitoring →
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// Key delivery metrics — high-signal summary
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
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`mt-0.5 text-[15px] font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-card border border-line bg-surface p-3.5">
            <LoadingSkeleton rows={2} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-1">
        <div className="bg-surface px-3.5 py-2">
          <LoadingSkeleton rows={1} />
        </div>
      </div>
    </div>
  );
}

function KpiGrid({ metrics }: { metrics: MetricsQuery }) {
  if (metrics.isError) {
    return (
      <div className="rounded-card border border-line bg-surface px-4 py-10">
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

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          compact
          label="Total Notifications"
          value={m.totalNotifications}
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
        <MetricCard
          compact
          label="In DLQ"
          value={m.dlqCount}
          variant={m.dlqCount > 0 ? 'danger' : 'default'}
        />
      </div>
      {/* Secondary metric — Retries (only if nonzero) */}
      {m.retryCount > 0 && (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-1">
          <StatCell
            label="Retries"
            value={m.retryCount}
            valueClass="text-warning-text"
          />
        </div>
      )}
      {/* Analytics entry point */}
      <div className="flex justify-end">
        <Link to="/analytics" className="text-[12px] font-medium text-primary hover:text-primary-hover transition-colors">
          View analytics →
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// Recent activity — actionable event stream
// ============================================================

function RecentActivity({ notifications, now }: { notifications: NotificationsQuery; now: number }) {
  const navigate = useNavigate();

  return (
    <div className="rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-section-title text-ink">Recent Activity</h2>
        <Link to="/notifications" className="text-[12px] font-medium text-primary hover:text-primary-hover transition-colors">
          View all →
        </Link>
      </div>

      {notifications.isLoading && <div className="px-4 py-3"><LoadingSkeleton rows={4} /></div>}
      {notifications.isError && (
        <div className="px-4 py-3">
          <ErrorState
            title="Unable to load recent activity"
            message="Could not load recent notifications."
            onRetry={notifications.refetch}
          />
        </div>
      )}
      {!notifications.isLoading && !notifications.isError && notifications.data?.items.length === 0 && (
        <EmptyState compact title="No notification activity yet" message="Notifications will appear here once the system processes them." />
      )}
      {!notifications.isLoading && !notifications.isError && notifications.data && notifications.data.items.length > 0 && (
        <ul className="divide-y divide-line">
          {notifications.data.items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => navigate(`/notifications/${n.id}`)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-elevated/50"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <StatusDot status={n.status} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-ink">
                      Notification {STATUS_ACTIVITY[n.status]}
                    </p>
                    <p className="truncate text-[11px] text-ink-faint">
                      {CHANNEL_LABEL[n.channel]} · {PRIORITY_LABEL[n.priority]}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-ink-muted">
                  {formatRelativeTime(n.createdAt, now)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// Page
// ============================================================

export function OverviewPage() {
  const { metrics, health, notifications, refetchAll, refreshing, lastUpdated } =
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

      <RecentActivity notifications={notifications} now={now} />
    </div>
  );
}
