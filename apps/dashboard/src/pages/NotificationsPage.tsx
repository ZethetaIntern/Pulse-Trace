import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { StatusBadge, PriorityBadge, ChannelBadge, CategoryBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { PageHeader, Button } from '../components/ui';
import type { ListNotificationsParams, NotificationStatus, Channel, Category, Priority, SortField, SortOrder } from '../types';

const STATUS_OPTIONS: NotificationStatus[] = [
  'CREATED', 'QUEUED', 'PROCESSING', 'DELIVERED', 'FAILED', 'RETRY_PENDING', 'DLQ', 'SKIPPED',
];
const CHANNEL_OPTIONS: Channel[] = ['EMAIL', 'SMS', 'IN_APP'];
const CATEGORY_OPTIONS: Category[] = ['TRANSACTIONAL', 'SECURITY', 'SYSTEM', 'INFORMATIONAL'];
const PRIORITY_OPTIONS: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

function FilterBar({
  params,
  onChange,
}: {
  params: ListNotificationsParams;
  onChange: (p: ListNotificationsParams) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <FilterSelect
        label="Status"
        value={params.status ?? ''}
        options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
        onChange={(v) => onChange({ ...params, status: (v as NotificationStatus) || undefined, page: 1 })}
      />
      <FilterSelect
        label="Channel"
        value={params.channel ?? ''}
        options={CHANNEL_OPTIONS.map((c) => ({ value: c, label: c }))}
        onChange={(v) => onChange({ ...params, channel: (v as Channel) || undefined, page: 1 })}
      />
      <FilterSelect
        label="Category"
        value={params.category ?? ''}
        options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))}
        onChange={(v) => onChange({ ...params, category: (v as Category) || undefined, page: 1 })}
      />
      <FilterSelect
        label="Priority"
        value={params.priority ?? ''}
        options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
        onChange={(v) => onChange({ ...params, priority: (v as Priority) || undefined, page: 1 })}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange({ sort: 'createdAt', order: 'desc' })}
        className="self-end"
      >
        Clear filters
      </Button>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="field-label">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field-control"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SortHeader({
  field,
  label,
  sort,
  order,
  onSort,
}: {
  field: SortField;
  label: string;
  sort: SortField;
  order: SortOrder;
  onSort: (f: SortField) => void;
}) {
  const active = sort === field;
  return (
    <th
      className="cursor-pointer select-none px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <span className="text-gray-900">{order === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  );
}

function formatShortId(id: string): string {
  return id.slice(0, 8) + '…';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useState<ListNotificationsParams>({
    page: 1,
    limit: 20,
    sort: 'createdAt',
    order: 'desc',
  });

  const { data, isLoading, isError, error, refetch } = useNotifications(params);

  const handleSort = (field: SortField) => {
    setParams((prev) => ({
      ...prev,
      sort: field,
      order: prev.sort === field && prev.order === 'desc' ? 'asc' : 'desc',
    }));
  };

  const pagination = data?.pagination;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Browse and filter all notifications."
      />

      <FilterBar params={params} onChange={setParams} />

      {isLoading && <LoadingSpinner message="Loading notifications..." />}
      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load notifications'}
          onRetry={refetch}
        />
        )}

      {!isLoading && !isError && data && data.items.length === 0 && (
        <EmptyState message="No notifications match the current filters." />
      )}

      {!isLoading && !isError && data && data.items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortHeader field="createdAt" label="Created" sort={params.sort!} order={params.order!} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <SortHeader field="channel" label="Channel" sort={params.sort!} order={params.order!} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Category
                  </th>
                  <SortHeader field="priority" label="Priority" sort={params.sort!} order={params.order!} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    ID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.items.map((n) => (
                  <tr
                    key={n.id}
                    onClick={() => navigate(`/notifications/${n.id}`)}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {formatDate(n.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={n.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <ChannelBadge channel={n.channel} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <CategoryBadge category={n.category} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <PriorityBadge priority={n.priority} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">
                      {formatShortId(n.id)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              onPageChange={(p) => setParams((prev) => ({ ...prev, page: p }))}
            />
          )}
        </div>
      )}
    </div>
  );
}
