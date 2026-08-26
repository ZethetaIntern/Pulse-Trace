import { useHealth } from '../hooks/useNotifications';
import { useDashboardMetrics } from '../hooks/useAnalytics';
import { LoadingSpinner } from '../components/LoadingSpinner';

function HealthCard() {
  const { data: health, isLoading, isError, error, refetch } = useHealth();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <LoadingSpinner message="Checking health..." />
      </div>
    );
  }

  if (isError || !health) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-sm font-medium text-red-700">API Unreachable</span>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {error instanceof Error ? error.message : 'Cannot reach the backend API'}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-3 rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="h-3 w-3 rounded-full bg-green-500" />
        <span className="text-sm font-medium text-gray-900">System Health</span>
      </div>
      <dl className="space-y-2">
        <div className="flex justify-between text-sm">
          <dt className="text-gray-500">Status</dt>
          <dd className="font-medium text-green-700">{health.status}</dd>
        </div>
        <div className="flex justify-between text-sm">
          <dt className="text-gray-500">Environment</dt>
          <dd className="font-medium text-gray-900">{health.environment}</dd>
        </div>
        <div className="flex justify-between text-sm">
          <dt className="text-gray-500">Version</dt>
          <dd className="font-medium text-gray-900">{health.version}</dd>
        </div>
        <div className="flex justify-between text-sm">
          <dt className="text-gray-500">Uptime</dt>
          <dd className="font-medium text-gray-900">{formatUptime(health.uptime)}</dd>
        </div>
      </dl>
    </div>
  );
}

function SummaryCards() {
  const { data: metrics, isLoading, isError, error, refetch } = useDashboardMetrics();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <LoadingSpinner message="Loading summary..." />
      </div>
    );
  }

  if (isError || !metrics) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-sm font-medium text-red-700">Failed to load summary</span>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {error instanceof Error ? error.message : 'Could not load dashboard metrics'}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-3 rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
        >
          Retry
        </button>
      </div>
    );
  }

  const cards = [
    { label: 'Total', value: metrics.totalNotifications },
    { label: 'Success Rate', value: `${metrics.successRate}%` },
    { label: 'Failure Rate', value: `${metrics.failureRate}%` },
    { label: 'Retries', value: metrics.retryCount },
    { label: 'In DLQ', value: metrics.dlqCount },
    {
      label: 'Channels',
      value: Object.keys(metrics.channelBreakdown).length,
    },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-medium text-gray-900">Notification Summary</h3>
      <p className="mb-4 text-xs text-gray-400">
        Global metrics from the analytics endpoint.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-md bg-gray-50 p-3">
            <div className="text-2xl font-semibold text-gray-900">{card.value}</div>
            <div className="mt-1 text-xs text-gray-500">{card.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          System health and notification summary.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <HealthCard />
        <SummaryCards />
      </div>
    </div>
  );
}
