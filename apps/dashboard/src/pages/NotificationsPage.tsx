import { useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { StatusBadge, PriorityBadge, ChannelBadge, CategoryBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { PageHeader, Button } from '../components/ui';
import type {
  ListNotificationsParams,
  NotificationResponse,
  NotificationStatus,
  Channel,
  Category,
  Priority,
  SortField,
  SortOrder,
} from '../types';

const STATUS_OPTIONS: NotificationStatus[] = [
  'CREATED', 'QUEUED', 'PROCESSING', 'DELIVERED', 'FAILED', 'RETRY_PENDING', 'DLQ', 'SKIPPED',
];
const CHANNEL_OPTIONS: Channel[] = ['EMAIL', 'SMS', 'IN_APP'];
const CATEGORY_OPTIONS: Category[] = ['TRANSACTIONAL', 'SECURITY', 'SYSTEM', 'INFORMATIONAL'];
const PRIORITY_OPTIONS: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

const STATUS_TAB_LABELS: Record<NotificationStatus, string> = {
  CREATED: 'Created',
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
  RETRY_PENDING: 'Retry Pending',
  DLQ: 'DLQ',
  SKIPPED: 'Skipped',
};

const STATUS_TABS: Array<{ value: NotificationStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  ...STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_TAB_LABELS[s] })),
];

// ─── Relative time ───────────────────────────────────────────

function useNow(intervalMs = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatRelativeTime(time: number | string, now: number): string {
  const t = typeof time === 'number' ? time : Date.parse(time);
  if (!Number.isFinite(t)) return '—';
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  if (seconds < 45) return seconds <= 10 ? 'just now' : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

// ─── Filter select ──────────────────────────────────────────

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
  const selectId = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="field-label">{label}</label>
      <select
        id={selectId}
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

// ─── Sortable column header ─────────────────────────────────

function SortHeader({
  field,
  label,
  sort,
  order,
  onSort,
  thClassName,
}: {
  field: SortField;
  label: string;
  sort: SortField;
  order: SortOrder;
  onSort: (f: SortField) => void;
  thClassName?: string;
}) {
  const active = sort === field;
  return (
    <th
      scope="col"
      className={thClassName ?? 'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-ink-muted'}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-label={`Sort by ${label}`}
        className="inline-flex cursor-pointer select-none items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-ink-muted transition-colors hover:text-ink"
      >
        {label}
        {active && (
          <span aria-hidden="true" className="text-ink">
            {order === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </button>
    </th>
  );
}

// ─── Notification table ─────────────────────────────────────

const TH = 'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-ink-muted';

function NotificationsTable({
  rows,
  now,
  sort,
  order,
  onSort,
  onOpen,
}: {
  rows: NotificationResponse[];
  now: number;
  sort: SortField;
  order: SortOrder;
  onSort: (f: SortField) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <table className="w-full text-[13px]">
      <caption className="sr-only">Notifications</caption>
      <thead className="border-b border-line">
        <tr>
          <SortHeader field="status" label="Status" sort={sort} order={order} onSort={onSort} />
          <SortHeader field="channel" label="Channel" sort={sort} order={order} onSort={onSort} />
          <th scope="col" className={`${TH} hidden lg:table-cell`}>
            Category
          </th>
          <SortHeader field="priority" label="Priority" sort={sort} order={order} onSort={onSort} />
          <SortHeader field="createdAt" label="Created" sort={sort} order={order} onSort={onSort} />
          <th scope="col" className={`${TH} text-right`}>
            Action
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((n) => (
          <tr
            key={n.id}
            onClick={() => onOpen(n.id)}
            className="cursor-pointer transition-colors hover:bg-elevated"
          >
            <td className="whitespace-nowrap px-3 py-2">
              <StatusBadge status={n.status} withDot size="sm" />
            </td>
            <td className="whitespace-nowrap px-3 py-2">
              <ChannelBadge channel={n.channel} />
            </td>
            <td className="hidden whitespace-nowrap px-3 py-2 lg:table-cell">
              <CategoryBadge category={n.category} />
            </td>
            <td className="whitespace-nowrap px-3 py-2">
              <PriorityBadge priority={n.priority} />
            </td>
            <td
              className="whitespace-nowrap px-3 py-2 text-[11px] text-ink-muted"
              title={formatDate(n.createdAt)}
            >
              {formatRelativeTime(n.createdAt, now)}
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-right">
              <Link
                to={`/notifications/${n.id}`}
                aria-label={`View notification ${n.id}`}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-primary transition-colors hover:underline"
              >
                View
                <span aria-hidden="true">→</span>
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Notification cards (mobile) ────────────────────────────

function NotificationCards({
  rows,
  now,
  onOpen,
}: {
  rows: NotificationResponse[];
  now: number;
  onOpen: (id: string) => void;
}) {
  return (
    <ul role="list" className="divide-y divide-line">
      {rows.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => onOpen(n.id)}
            className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-elevated"
          >
            <span className="flex items-center justify-between gap-2">
              <StatusBadge status={n.status} withDot size="sm" />
              <span className="text-[11px] text-ink-faint" title={formatDate(n.createdAt)}>
                {formatRelativeTime(n.createdAt, now)}
              </span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
              <ChannelBadge channel={n.channel} />
              <span aria-hidden="true" className="text-ink-faint">·</span>
              <PriorityBadge priority={n.priority} />
            </span>
            <span className="mt-0.5 block text-[11px] text-ink-muted">Category: {n.category}</span>
            <span className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-primary">
              View
              <span aria-hidden="true">→</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Loading skeleton (table-like) ──────────────────────────

function ListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading notifications"
      className="overflow-hidden rounded-container border border-line bg-surface"
    >
      <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <div className="h-3 w-12 animate-pulse rounded bg-elevated" />
        <div className="h-3 w-14 animate-pulse rounded bg-elevated" />
        <div className="h-3 w-14 animate-pulse rounded bg-elevated" />
        <div className="h-3 w-16 animate-pulse rounded bg-elevated" />
        <div className="h-3 w-10 animate-pulse rounded bg-elevated" />
      </div>
      {Array.from({ length: 7 }, (_, i) => (
        <div
          key={i}
          className={`flex items-center justify-between gap-3 px-3 py-2.5 ${i < 6 ? 'border-b border-line' : ''}`}
        >
          <div className="flex items-center gap-2.5">
            <div className="h-4 w-20 animate-pulse rounded-full bg-elevated" />
            <div className="h-3 w-12 animate-pulse rounded bg-elevated" />
            <div className="h-3 w-16 animate-pulse rounded bg-elevated" />
            <div className="h-3 w-14 animate-pulse rounded bg-elevated" />
          </div>
          <div className="h-3 w-10 animate-pulse rounded bg-elevated" />
        </div>
      ))}
      <span className="sr-only">Loading notifications...</span>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export function NotificationsPage() {
  const navigate = useNavigate();
  const now = useNow();
  const [params, setParams] = useState<ListNotificationsParams>({
    page: 1,
    limit: 20,
    sort: 'createdAt',
    order: 'desc',
  });

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useNotifications(params);

  const hasActiveFilters = Boolean(
    params.status || params.channel || params.category || params.priority,
  );

  const handleSort = (field: SortField) => {
    setParams((prev) => ({
      ...prev,
      sort: field,
      order: prev.sort === field && prev.order === 'desc' ? 'asc' : 'desc',
    }));
  };

  const updateFilter = (patch: Partial<ListNotificationsParams>) => {
    setParams((prev) => ({ ...prev, ...patch, page: 1 }));
  };

  const clearFilters = () => {
    setParams({ page: 1, limit: 20, sort: 'createdAt', order: 'desc' });
  };

  const openNotification = (id: string) => {
    navigate(`/notifications/${id}`);
  };

  const sort = params.sort ?? 'createdAt';
  const order = params.order ?? 'desc';
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="Browse, filter, and investigate notification delivery."
        actions={
          <div className="flex items-center gap-2.5">
            {dataUpdatedAt > 0 && (
              <span className="hidden text-[11px] text-ink-faint sm:inline">
                Updated {formatRelativeTime(dataUpdatedAt, now)}
              </span>
            )}
            <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        }
      />

      <div className="rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3.5 py-2.5">
          <h2 className="text-section-title text-ink">Filter notifications</h2>
          {hasActiveFilters && (
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-x-3.5 gap-y-2.5 px-3.5 py-2.5">
          <FilterSelect
            label="Channel"
            value={params.channel ?? ''}
            options={CHANNEL_OPTIONS.map((c) => ({ value: c, label: c }))}
            onChange={(v) => updateFilter({ channel: (v as Channel) || undefined })}
          />
          <FilterSelect
            label="Category"
            value={params.category ?? ''}
            options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))}
            onChange={(v) => updateFilter({ category: (v as Category) || undefined })}
          />
          <FilterSelect
            label="Priority"
            value={params.priority ?? ''}
            options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
            onChange={(v) => updateFilter({ priority: (v as Priority) || undefined })}
          />
        </div>
      </div>

      <div
        role="group"
        aria-label="Filter by status"
        className="rounded-card border border-line bg-surface p-1"
      >
        <div className="flex flex-wrap gap-0.5">
          {STATUS_TABS.map((tab) => {
            const active = params.status === tab.value || (params.status === undefined && tab.value === 'ALL');
            return (
              <button
                key={tab.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  updateFilter({ status: tab.value === 'ALL' ? undefined : (tab.value as NotificationStatus) })
                }
                className={[
                  'inline-flex h-6.5 items-center whitespace-nowrap rounded-control px-2 text-[11px] font-medium transition-colors',
                  active
                    ? 'bg-elevated text-ink'
                    : 'text-ink-muted hover:bg-elevated hover:text-ink-secondary',
                ].join(' ')}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && <ListSkeleton />}

      {isError && (
        <ErrorState
          title="Unable to load notifications"
          message="We couldn't retrieve notifications right now."
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && data && data.items.length === 0 && (
        <div className="rounded-container border border-line bg-surface">
          <EmptyState
            compact
            title={hasActiveFilters ? 'No notifications match these filters' : 'No notifications yet'}
            message={
              hasActiveFilters
                ? 'Try adjusting or clearing your filters.'
                : 'Notifications will appear here once the system processes them.'
            }
            action={
              hasActiveFilters ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {!isLoading && !isError && data && data.items.length > 0 && (
        <div className="overflow-hidden rounded-container border border-line bg-surface">
          <div className="hidden md:block">
            <NotificationsTable
              rows={data.items}
              now={now}
              sort={sort}
              order={order}
              onSort={handleSort}
              onOpen={openNotification}
            />
          </div>
          <div className="md:hidden">
            <NotificationCards rows={data.items} now={now} onOpen={openNotification} />
          </div>
          {pagination && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={(p) => setParams((prev) => ({ ...prev, page: p }))}
            />
          )}
        </div>
      )}
    </div>
  );
}