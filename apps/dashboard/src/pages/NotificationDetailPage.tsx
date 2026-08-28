import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useNotification, useReplayHistory, useReplayNotification } from '../hooks/useNotifications';
import { StatusBadge, PriorityBadge, ChannelBadge, CategoryBadge } from '../components/StatusBadge';
import { JsonViewer } from '../components/JsonViewer';
import { TimelineView } from '../components/TimelineView';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorState } from '../components/ErrorState';
import { Button } from '../components/ui';
import type { NotificationStatus } from '../types';

const REPLAYABLE_STATUSES: NotificationStatus[] = [
  'DELIVERED', 'FAILED', 'RETRY_PENDING', 'DLQ', 'SKIPPED',
];

function isReplayable(status: NotificationStatus): boolean {
  return REPLAYABLE_STATUSES.includes(status);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

// ─── Notification Info Section ───────────────────────────────────────────────

function NotificationInfo({ data }: { data: NonNullable<ReturnType<typeof useNotification>['data']> }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
          Notification Details
        </h2>
        <StatusBadge status={data.status} />
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <InfoItem label="ID">
          <span className="font-mono text-xs text-gray-700 break-all">{data.id}</span>
        </InfoItem>
        <InfoItem label="Status">
          <StatusBadge status={data.status} />
        </InfoItem>
        <InfoItem label="User ID">
          <span className="font-mono text-xs text-gray-700 break-all">{data.userId}</span>
        </InfoItem>
        <InfoItem label="Template ID">
          <span className="font-mono text-xs text-gray-700 break-all">{data.templateId}</span>
        </InfoItem>
        <InfoItem label="Channel">
          <ChannelBadge channel={data.channel} />
        </InfoItem>
        <InfoItem label="Category">
          <CategoryBadge category={data.category} />
        </InfoItem>
        <InfoItem label="Priority">
          <PriorityBadge priority={data.priority} />
        </InfoItem>
        <InfoItem label="Created">{formatDate(data.createdAt)}</InfoItem>
        <InfoItem label="Updated">{formatDate(data.updatedAt)}</InfoItem>
      </dl>
      <div className="mt-4 space-y-3">
        <JsonViewer data={data.payload} label="Payload" defaultExpanded />
        <JsonViewer data={data.metadata} label="Metadata" />
      </div>
    </div>
  );
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

// ─── Replay Section ──────────────────────────────────────────────────────────

function ReplaySection({
  notificationId,
  status,
}: {
  notificationId: string;
  status: NotificationStatus;
}) {
  const [reason, setReason] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const replayMutation = useReplayNotification(notificationId);

  const canReplay = isReplayable(status);

  if (!canReplay) return null;

  const handleReplay = () => {
    replayMutation.mutate(reason || undefined, {
      onSuccess: () => {
        setShowConfirm(false);
        setReason('');
      },
    });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-gray-900 uppercase tracking-wider">
        Replay
      </h2>
      {!showConfirm ? (
        <Button onClick={() => setShowConfirm(true)}>
          Replay Notification
        </Button>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Provider recovered"
              className="field-control w-full"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleReplay}
              disabled={replayMutation.isPending}
            >
              {replayMutation.isPending ? 'Replaying...' : 'Confirm Replay'}
            </Button>
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
          </div>
          {replayMutation.isError && (
            <p className="text-sm text-red-600">
              {replayMutation.error instanceof Error
                ? replayMutation.error.message
                : 'Replay failed'}
            </p>
          )}
          {replayMutation.isSuccess && replayMutation.data && (
            <div className="rounded-md bg-green-50 border border-green-200 p-3">
              <p className="text-sm font-medium text-green-800">Replay started</p>
              <p className="mt-1 text-xs text-green-600">
                New notification:{' '}
                <Link
                  to={`/notifications/${replayMutation.data.notificationId}`}
                  className="font-mono underline hover:text-green-800"
                >
                  {replayMutation.data.notificationId.slice(0, 8)}…
                </Link>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Replay History ──────────────────────────────────────────────────────────

function ReplayHistorySection({ notificationId }: { notificationId: string }) {
  const { data: replays, isLoading } = useReplayHistory(notificationId);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900 uppercase tracking-wider">
          Replay History
        </h2>
        <LoadingSpinner message="Loading replay history..." />
      </div>
    );
  }

  if (!replays || replays.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-gray-900 uppercase tracking-wider">
        Replay History
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Triggered At</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Reason</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">New Notification</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {replays.map((r) => (
              <tr key={r.replayId} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                  {formatDate(r.createdAt)}
                </td>
                <td className="px-3 py-2 text-gray-500">{r.reason || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {r.newNotificationId ? (
                    <Link
                      to={`/notifications/${r.newNotificationId}`}
                      className="font-mono text-xs text-blue-600 hover:underline"
                    >
                      {r.newNotificationId.slice(0, 8)}…
                    </Link>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.newNotificationStatus ? (
                    <StatusBadge status={r.newNotificationStatus as NotificationStatus} />
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function NotificationDetailPage() {
  const { notificationId } = useParams<{ notificationId: string }>();
  const id = notificationId ?? '';
  const { data, isLoading, isError, error, refetch } = useNotification(id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/notifications"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Notification Detail</h1>
          {id && (
            <p className="mt-0.5 font-mono text-xs text-gray-400">{id}</p>
          )}
        </div>
      </div>

      {isLoading && <LoadingSpinner message="Loading notification..." />}
      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load notification'}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && data && (
        <div className="space-y-6">
          <NotificationInfo data={data} />

          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <TimelineView notificationId={id} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ReplaySection notificationId={id} status={data.status} />
            <ReplayHistorySection notificationId={id} />
          </div>
        </div>
      )}
    </div>
  );
}
