import { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { MetricCard } from '../components/analytics/MetricCard';
import { DeliveryTrendChart } from '../components/analytics/DeliveryTrendChart';
import { ChannelBreakdown } from '../components/analytics/ChannelBreakdown';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Button, Card, LoadingSkeleton, PageHeader } from '../components/ui';
import { ApiRequestError } from '../api/client';
import {
  useChannelStatistics,
  useDashboardMetrics,
  useDeliveryTrends,
} from '../hooks/useAnalytics';
import type {
  ChannelStatisticsResponse,
  DashboardMetricsResponse,
  DeliveryTrendsResponse,
  TrendInterval,
} from '../types';

const INTERVAL_LABELS: Record<TrendInterval, string> = {
  hour: 'Hour',
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

type MetricsQuery = UseQueryResult<DashboardMetricsResponse, Error>;
type TrendsQuery = UseQueryResult<DeliveryTrendsResponse, Error>;
type ChannelsQuery = UseQueryResult<ChannelStatisticsResponse, Error>;

function getDefaultDates(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

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

function trendsValidationMessage(error: Error | null): string | undefined {
  if (
    error instanceof ApiRequestError &&
    error.status === 400 &&
    error.details &&
    error.details.length > 0
  ) {
    return error.details.map((d) => `${d.field}: ${d.message}`).join(' ');
  }
  return undefined;
}

// ============================================================
// KPIs
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
          title="Unable to load analytics summary"
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
    <div className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          compact
          label="Total Notifications"
          value={m.totalNotifications}
          subtitle={empty ? 'No notifications yet' : undefined}
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
        <StatCell label="Channels" value={Object.keys(m.channelBreakdown).length} />
      </div>
    </div>
  );
}

// ============================================================
// Delivery trends
// ============================================================

interface TrendsToolbarProps {
  from: string;
  to: string;
  interval: TrendInterval;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onIntervalChange: (value: TrendInterval) => void;
}

function TrendsToolbar({
  from,
  to,
  interval,
  onFromChange,
  onToChange,
  onIntervalChange,
}: TrendsToolbarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-end gap-x-3.5 gap-y-2.5">
      <div className="flex flex-col gap-1">
        <label htmlFor="trend-from" className="field-label">
          From
        </label>
        <input
          id="trend-from"
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="field-control"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="trend-to" className="field-label">
          To
        </label>
        <input
          id="trend-to"
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="field-control"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="trend-interval" className="field-label">
          Interval
        </label>
        <select
          id="trend-interval"
          value={interval}
          onChange={(e) => onIntervalChange(e.target.value as TrendInterval)}
          className="field-control"
        >
          {(Object.keys(INTERVAL_LABELS) as TrendInterval[]).map((iv) => (
            <option key={iv} value={iv}>
              {INTERVAL_LABELS[iv]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

interface TrendsCardProps {
  trends: TrendsQuery;
  from: string;
  to: string;
  interval: TrendInterval;
  hasNotifications: boolean | undefined;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onIntervalChange: (value: TrendInterval) => void;
  onResetRange: () => void;
}

function TrendsCard({
  trends,
  from,
  to,
  interval,
  hasNotifications,
  onFromChange,
  onToChange,
  onIntervalChange,
  onResetRange,
}: TrendsCardProps) {
  return (
    <Card
      title="Delivery trends"
      subtitle="Select a date range to explore notification delivery over time."
    >
      <TrendsToolbar
        from={from}
        to={to}
        interval={interval}
        onFromChange={onFromChange}
        onToChange={onToChange}
        onIntervalChange={onIntervalChange}
      />

      {trends.isLoading && (
        <div className="rounded-control border border-line bg-elevated p-3.5">
          <LoadingSkeleton rows={6} />
        </div>
      )}

      {trends.isError && (
        <div className="py-3">
          <ErrorState
            title="Unable to load delivery trends"
            message={trendsValidationMessage(trends.error) ?? 'Could not load delivery trends for the selected period.'}
            onRetry={trends.refetch}
          />
        </div>
      )}

      {!trends.isLoading &&
        !trends.isError &&
        trends.data &&
        trends.data.buckets.length === 0 && (
          <EmptyState
            compact
            title={hasNotifications === false ? 'No notification data yet' : 'No delivery data for this period'}
            message={
              hasNotifications === false
                ? 'Delivery trends will appear once the system processes notifications.'
                : 'Try selecting a different date range.'
            }
            action={
              hasNotifications === false ? undefined : (
                <Button variant="secondary" size="sm" onClick={onResetRange}>
                  Reset to last 30 days
                </Button>
              )
            }
          />
        )}

      {!trends.isLoading &&
        !trends.isError &&
        trends.data &&
        trends.data.buckets.length > 0 && (
          <DeliveryTrendChart buckets={trends.data.buckets} interval={trends.data.interval} />
        )}
    </Card>
  );
}

// ============================================================
// Channel performance
// ============================================================

function ChannelsCard({ channels }: { channels: ChannelsQuery }) {
  return (
    <Card title="Channel performance" subtitle="Delivery success by channel">
      {channels.isLoading && (
        <div className="rounded-control border border-line bg-elevated p-3.5">
          <LoadingSkeleton rows={4} />
        </div>
      )}
      {channels.isError && (
        <div className="py-3">
          <ErrorState
            title="Unable to load channel statistics"
            message="Could not load channel statistics."
            onRetry={channels.refetch}
          />
        </div>
      )}
      {!channels.isLoading &&
        !channels.isError &&
        channels.data &&
        channels.data.channels.length === 0 && (
          <EmptyState
            compact
            title="No channel data available"
            message="Channel statistics will appear once notifications are processed."
          />
        )}
      {!channels.isLoading &&
        !channels.isError &&
        channels.data &&
        channels.data.channels.length > 0 && (
          <ChannelBreakdown channels={channels.data.channels} />
        )}
    </Card>
  );
}

// ============================================================
// Page
// ============================================================

export function AnalyticsPage() {
  const defaults = getDefaultDates();
  const [interval, setInterval] = useState<TrendInterval>('day');
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const now = useNow();

  const metrics = useDashboardMetrics();
  const trends = useDeliveryTrends({ from, to, interval });
  const channels = useChannelStatistics();

  const refreshing = metrics.isFetching || trends.isFetching || channels.isFetching;

  const handleRefresh = () => {
    void Promise.allSettled([metrics.refetch(), trends.refetch(), channels.refetch()]);
  };

  const handleResetRange = () => {
    const d = getDefaultDates();
    setFrom(d.from);
    setTo(d.to);
  };

  const updatedAt = [metrics, trends, channels]
    .map((query) => query.dataUpdatedAt)
    .filter((t) => t > 0)
    .reduce((max, t) => Math.max(max, t), 0);

  const updatedLabel = updatedAt > 0 ? `Updated ${formatRelativeTime(updatedAt, now)}` : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        description="Notification metrics, delivery trends, and channel performance."
        actions={
          <div className="flex items-center gap-2.5">
            {updatedLabel && <span className="text-[11px] text-ink-faint">{updatedLabel}</span>}
            <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        }
      />

      <KpiGrid metrics={metrics} />

      <TrendsCard
        trends={trends}
        from={from}
        to={to}
        interval={interval}
        hasNotifications={metrics.data ? metrics.data.totalNotifications > 0 : undefined}
        onFromChange={setFrom}
        onToChange={setTo}
        onIntervalChange={setInterval}
        onResetRange={handleResetRange}
      />

      <ChannelsCard channels={channels} />
    </div>
  );
}