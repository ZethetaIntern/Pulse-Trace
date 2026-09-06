import { useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DeliveryTrendChart } from '../components/analytics/DeliveryTrendChart';
import { ChannelBreakdown } from '../components/analytics/ChannelBreakdown';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Button, Card, LoadingSkeleton, PageHeader } from '../components/ui';
import { ApiRequestError } from '../api/client';
import { useNow, formatRelativeTime } from '../lib/time';
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

function trendsValidationMessage(error: Error | null): string | undefined {
  if (error instanceof ApiRequestError && error.status === 400 && error.details && error.details.length > 0) {
    return error.details.map((d) => `${d.field}: ${d.message}`).join(' ');
  }
  return undefined;
}

// ============================================================
// Delivery performance — compact analytical summary
// ============================================================

function DeliveryPerformanceSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-2.5">
      <LoadingSkeleton rows={1} />
    </div>
  );
}

function DeliveryPerformance({ metrics }: { metrics: MetricsQuery }) {
  if (metrics.isError) {
    return (
      <div className="rounded-card border border-line bg-surface px-4 py-3">
        <ErrorState
          title="Unable to load delivery summary"
          message="Could not load notification metrics."
          onRetry={metrics.refetch}
        />
      </div>
    );
  }

  if (metrics.isLoading || !metrics.data) {
    return <DeliveryPerformanceSkeleton />;
  }

  const m = metrics.data;
  const empty = m.totalNotifications === 0;

  return (
    <div className="rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <h2 className="text-section-title text-ink">Delivery Performance</h2>
        <Link to="/notifications" className="text-[12px] font-medium text-primary hover:text-primary-hover transition-colors">
          View notifications →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-5">
        <MetricCell
          label="Total"
          value={m.totalNotifications}
        />
        <MetricCell
          label="Success"
          value={empty ? '—' : `${m.successRate}%`}
          valueClass={empty || m.successRate === 0 ? 'text-ink' : 'text-success-text'}
        />
        <MetricCell
          label="Failure"
          value={empty ? '—' : `${m.failureRate}%`}
          valueClass={empty || m.failureRate === 0 ? 'text-ink' : 'text-error-text'}
        />
        <MetricCell
          label="Retries"
          value={m.retryCount}
          valueClass={m.retryCount > 0 ? 'text-warning-text' : 'text-ink'}
        />
        <MetricCell
          label="DLQ"
          value={m.dlqCount}
          valueClass={m.dlqCount > 0 ? 'text-error-text' : 'text-ink'}
        />
      </div>
    </div>
  );
}

function MetricCell({
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

// ============================================================
// Delivery trend — chart with no embedded controls
// ============================================================

function TrendsCard({ trends, hasNotifications, onResetRange }: {
  trends: TrendsQuery;
  hasNotifications: boolean | undefined;
  onResetRange: () => void;
}) {
  return (
    <Card title="Delivery Trend" subtitle="Notification delivery over the selected period.">
      {trends.isLoading && <div className="rounded-control border border-line bg-elevated p-3.5"><LoadingSkeleton rows={6} /></div>}

      {trends.isError && (
        <div className="py-3">
          <ErrorState title="Unable to load delivery trends" message={trendsValidationMessage(trends.error) ?? 'Could not load delivery trends for the selected period.'} onRetry={trends.refetch} />
        </div>
      )}

      {!trends.isLoading && !trends.isError && trends.data && trends.data.buckets.length === 0 && (
        <EmptyState compact
          title={hasNotifications === false ? 'No notification data yet' : 'No delivery data for this period'}
          message={hasNotifications === false ? 'Delivery trends will appear once the system processes notifications.' : 'Try selecting a different date range.'}
          action={hasNotifications === false ? undefined : <Button variant="secondary" size="sm" onClick={onResetRange}>Reset to last 30 days</Button>}
        />
      )}

      {!trends.isLoading && !trends.isError && trends.data && trends.data.buckets.length > 0 && (
        <DeliveryTrendChart buckets={trends.data.buckets} interval={trends.data.interval} />
      )}
    </Card>
  );
}

// ============================================================
// Channel performance — dense table
// ============================================================

function ChannelsCard({ channels }: { channels: ChannelsQuery }) {
  return (
    <Card title="Channel Performance" subtitle="Delivery success by channel">
      {channels.isLoading && <div className="rounded-control border border-line bg-elevated p-3.5"><LoadingSkeleton rows={4} /></div>}
      {channels.isError && <div className="py-3"><ErrorState title="Unable to load channel statistics" message="Could not load channel statistics." onRetry={channels.refetch} /></div>}
      {!channels.isLoading && !channels.isError && channels.data && channels.data.channels.length === 0 && (
        <EmptyState compact title="No channel data available" message="Channel statistics will appear once notifications are processed." />
      )}
      {!channels.isLoading && !channels.isError && channels.data && channels.data.channels.length > 0 && (
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
    .map((q) => q.dataUpdatedAt)
    .filter((t) => t > 0)
    .reduce((max, t) => Math.max(max, t), 0);

  const updatedLabel = updatedAt > 0 ? `Updated ${formatRelativeTime(updatedAt, now)}` : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        description="Delivery performance, trends, and channel analysis."
        actions={
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            {/* Date range + interval controls */}
            <div className="flex flex-col gap-0.5">
              <label htmlFor="analytics-from" className="field-label">From</label>
              <input id="analytics-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field-control h-7 text-[12px]" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label htmlFor="analytics-to" className="field-label">To</label>
              <input id="analytics-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field-control h-7 text-[12px]" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label htmlFor="analytics-interval" className="field-label">Interval</label>
              <select id="analytics-interval" value={interval} onChange={(e) => setInterval(e.target.value as TrendInterval)} className="field-control h-7 text-[12px]">
                {(Object.keys(INTERVAL_LABELS) as TrendInterval[]).map((iv) => (
                  <option key={iv} value={iv}>{INTERVAL_LABELS[iv]}</option>
                ))}
              </select>
            </div>
            {/* Refresh */}
            {updatedLabel && <span className="text-[11px] text-ink-faint">{updatedLabel}</span>}
            <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        }
      />

      <DeliveryPerformance metrics={metrics} />

      <TrendsCard
        trends={trends}
        hasNotifications={metrics.data ? metrics.data.totalNotifications > 0 : undefined}
        onResetRange={handleResetRange}
      />

      <ChannelsCard channels={channels} />
    </div>
  );
}
