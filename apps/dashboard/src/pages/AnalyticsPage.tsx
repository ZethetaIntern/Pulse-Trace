import { useState } from 'react';
import { useDashboardMetrics, useDeliveryTrends, useChannelStatistics } from '../hooks/useAnalytics';
import { MetricCard } from '../components/analytics/MetricCard';
import { DeliveryTrendChart } from '../components/analytics/DeliveryTrendChart';
import { ChannelBreakdown } from '../components/analytics/ChannelBreakdown';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorState } from '../components/ErrorState';
import { PageHeader } from '../components/ui';
import type { TrendInterval } from '../types';

function getDefaultDates(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function SummarySection() {
  const { data: metrics, isLoading, isError, error, refetch } = useDashboardMetrics();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <LoadingSpinner message="Loading metrics..." />
      </div>
    );
  }

  if (isError || !metrics) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load dashboard metrics'}
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MetricCard
        label="Total Notifications"
        value={metrics.totalNotifications}
      />
      <MetricCard
        label="Success Rate"
        value={`${metrics.successRate}%`}
        variant="success"
      />
      <MetricCard
        label="Failure Rate"
        value={`${metrics.failureRate}%`}
        variant={metrics.failureRate > 0 ? 'danger' : 'default'}
      />
      <MetricCard
        label="Retry Count"
        value={metrics.retryCount}
        variant={metrics.retryCount > 0 ? 'warning' : 'default'}
      />
      <MetricCard
        label="DLQ Count"
        value={metrics.dlqCount}
        variant={metrics.dlqCount > 0 ? 'danger' : 'default'}
      />
      <MetricCard
        label="Channels"
        value={Object.keys(metrics.channelBreakdown).length}
        subtitle={Object.entries(metrics.channelBreakdown)
          .map(([ch, count]) => `${ch}: ${count}`)
          .join(', ') || 'No data'}
      />
    </div>
  );
}

function TrendsSection() {
  const defaults = getDefaultDates();
  const [interval, setInterval] = useState<TrendInterval>('day');
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const { data: trends, isLoading, isError, error, refetch } = useDeliveryTrends({
    from,
    to,
    interval,
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-gray-900 uppercase tracking-wider">
        Delivery Trends
      </h2>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="field-label">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="field-control"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="field-label">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="field-control"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="field-label">Interval</label>
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value as TrendInterval)}
            className="field-control"
          >
            <option value="hour">Hour</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
      </div>

      {isLoading && <LoadingSpinner message="Loading trends..." />}
      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load delivery trends'}
          onRetry={refetch}
        />
      )}
      {!isLoading && !isError && trends && (
        <DeliveryTrendChart buckets={trends.buckets} interval={trends.interval} />
      )}
    </div>
  );
}

function ChannelsSection() {
  const { data, isLoading, isError, error, refetch } = useChannelStatistics();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <LoadingSpinner message="Loading channel statistics..." />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load channel statistics'}
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-gray-900 uppercase tracking-wider">
        Channel Statistics
      </h2>
      <ChannelBreakdown channels={data.channels} />
    </div>
  );
}

export function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Notification metrics, delivery trends, and channel statistics."
      />

      <SummarySection />

      <TrendsSection />

      <ChannelsSection />
    </div>
  );
}
