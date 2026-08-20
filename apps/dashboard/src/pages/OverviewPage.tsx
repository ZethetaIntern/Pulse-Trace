import { useHealth, useNotifications } from '../hooks/useNotifications';
import { LoadingSpinner } from '../components/LoadingSpinner';
import type { NotificationStatus } from '../types';

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
  const { data: allData } = useNotifications({ limit: 100 });
  const items = allData?.items ?? [];

  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.status] = (counts[item.status] || 0) + 1;
  }

  const cards: { label: string; count: number; status: NotificationStatus | null }[] = [
    { label: 'Fetched', count: items.length, status: null },
    { label: 'Delivered', count: counts['DELIVERED'] ?? 0, status: 'DELIVERED' },
    { label: 'Failed', count: counts['FAILED'] ?? 0, status: 'FAILED' },
    { label: 'Queued', count: counts['QUEUED'] ?? 0, status: 'QUEUED' },
    { label: 'Processing', count: counts['PROCESSING'] ?? 0, status: 'PROCESSING' },
    { label: 'In DLQ', count: counts['DLQ'] ?? 0, status: 'DLQ' },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-medium text-gray-900">Notification Summary</h3>
      <p className="mb-4 text-xs text-gray-400">
        Counts below are derived from the current page of the notification list API (up to 100 items). These are <strong>not</strong> global database totals.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-md bg-gray-50 p-3">
            <div className="text-2xl font-semibold text-gray-900">{card.count}</div>
            <div className="mt-1 text-xs text-gray-500">{card.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonitoringNotice() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <svg className="mt-0.5 h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-amber-800">
            Detailed queue and worker monitoring is not yet available.
          </p>
          <p className="mt-1 text-xs text-amber-600">
            The documented /monitoring/health, /monitoring/queues, and /monitoring/workers
            endpoints have not been implemented yet. This section will be expanded in a future phase.
          </p>
        </div>
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
      <MonitoringNotice />
    </div>
  );
}
