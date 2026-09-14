import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useNotification,
  useDeadLetter,
  useReplayHistory,
  useReplayNotification,
  useTimeline,
} from '../hooks/useNotifications';
import { StatusBadge, PriorityBadge, ChannelBadge, CategoryBadge } from '../components/StatusBadge';
import { JsonViewer } from '../components/JsonViewer';
import { TimelineView } from '../components/TimelineView';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { Card, Button, LoadingSkeleton, PageHeader } from '../components/ui';
import { ApiRequestError } from '../api/client';
import { useNow, formatRelativeTimePrecise, formatDateTime } from '../lib/time';
import type { TimelineEventResponse, NotificationStatus } from '../types';

const REPLAYABLE_STATUSES: NotificationStatus[] = ['DLQ'];
const FAILURE_STATUSES: NotificationStatus[] = ['FAILED', 'RETRY_PENDING', 'DLQ'];

function isReplayable(status: NotificationStatus): boolean {
  return REPLAYABLE_STATUSES.includes(status);
}

function isFailureStatus(status: NotificationStatus): boolean {
  return FAILURE_STATUSES.includes(status);
}

// ─── Copyable ID ─────────────────────────────────────────────

function CopyableId({ id, label }: { id: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* Clipboard unavailable */ }
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <code className="min-w-0 break-all font-mono text-[11px] text-ink-muted">{id}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="inline-flex items-center rounded-control border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copied to clipboard.` : ''}
      </span>
    </div>
  );
}

// ─── Summary strip ──────────────────────────────────────────

function SummaryCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-surface px-3.5 py-2">
      <dt className="truncate text-[10px] font-medium uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="mt-0.5 flex min-w-0 items-center">{children}</dd>
    </div>
  );
}

function SummaryTime({ iso, now }: { iso: string; now: number }) {
  return (
    <time dateTime={iso} title={formatDateTime(iso)} className="truncate text-[13px] text-ink">
      {formatRelativeTimePrecise(iso, now)}
    </time>
  );
}

// ─── Technical details ──────────────────────────────────────

function TechRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="mt-0.5 min-w-0">{children}</dd>
    </div>
  );
}

// ─── Failure / retry information ─────────────────────────────

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function metadataNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === 'number' ? value : undefined;
}

function DeadLetterCard({ notificationId, status }: { notificationId: string; status: NotificationStatus }) {
  const { data: dlq, isLoading } = useDeadLetter(notificationId, status === 'DLQ');

  if (status !== 'DLQ') return null;
  if (isLoading) return <Card title="Dead-Letter Record" subtitle="Investigating DLQ metadata"><LoadingSkeleton rows={3} /></Card>;
  if (!dlq) return null;

  return (
    <Card title="Dead-Letter Record (DLQ)" subtitle="Durable DLQ entry and error analysis">
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="DLQ" withDot />
          {dlq.resolvedAt ? (
            <span className="rounded-control bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success-text">
              Resolved ({formatDateTime(dlq.resolvedAt)}{dlq.resolvedBy ? ` by ${dlq.resolvedBy}` : ''})
            </span>
          ) : (
            <span className="rounded-control bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning-text">
              Unresolved / Pending Replay
            </span>
          )}
          <span className="text-[11px] text-ink-muted">
            Failed attempts: {dlq.failedAttempts}
          </span>
        </div>

        {dlq.lastErrorMessage && (
          <p className="rounded-control border border-line bg-sidebar px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-ink-muted">
            {dlq.lastErrorCode ? `[${dlq.lastErrorCode}] ` : ''}{dlq.lastErrorMessage}
          </p>
        )}

        {dlq.errorDetails && Array.isArray(dlq.errorDetails) && dlq.errorDetails.length > 0 && (
          <div className="pt-1">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-ink-faint">Error Details History</p>
            <JsonViewer data={dlq.errorDetails as unknown as Record<string, unknown>} label="Error Details" defaultExpanded={false} />
          </div>
        )}
      </div>
    </Card>
  );
}

function FailureCard({ status, events }: { status: NotificationStatus; events?: TimelineEventResponse[] }) {
  if (!isFailureStatus(status) || status === 'DLQ') return null;

  const failures = (events ?? []).filter((e) => e.event === 'DELIVERY_FAILED');
  const lastFailure = failures[failures.length - 1];
  const errorMsg = metadataString(lastFailure?.metadata, 'error');
  const attempt = metadataNumber(lastFailure?.metadata, 'attempt');
  const maxAttempts = metadataNumber(lastFailure?.metadata, 'maxAttempts');
  const retryScheduled = (events ?? []).some((e) => e.event === 'RETRY_SCHEDULED');

  const title = status === 'RETRY_PENDING' ? 'Retry pending' : 'Delivery failed';
  const subtitle = status === 'RETRY_PENDING' ? 'Delivery failed and a retry is scheduled.' : 'This notification could not be delivered.';

  return (
    <Card title={title} subtitle={subtitle}>
      <div className="flex items-center gap-2">
        <StatusBadge status={status} withDot />
      </div>
      {errorMsg && (
        <p className="mt-2 rounded-control border border-line bg-sidebar px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-ink-muted">
          {errorMsg}
        </p>
      )}
      {(attempt !== undefined || maxAttempts !== undefined) && (
        <p className="mt-1.5 text-[11px] text-ink-muted">
          Failed attempt {attempt ?? '—'} of {maxAttempts ?? '—'}
        </p>
      )}
      {retryScheduled && (
        <p className="mt-0.5 text-[11px] text-ink-muted">Another attempt was scheduled automatically.</p>
      )}
    </Card>
  );
}

// ─── Replay ──────────────────────────────────────────────────

function ReplaySection({
  notificationId,
  status,
  hasActiveReplay,
  onReplayed,
}: {
  notificationId: string;
  status: NotificationStatus;
  hasActiveReplay: boolean;
  onReplayed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const replayMutation = useReplayNotification(notificationId);

  if (!isReplayable(status)) return null;

  const submit = () => {
    replayMutation.mutate(reason.trim() || undefined, {
      onSuccess: () => { setOpen(false); setReason(''); onReplayed(); },
    });
  };

  return (
    <section id="replay-section" tabIndex={-1} aria-label="Replay notification" className="rounded-card border border-line bg-surface p-4 focus:outline-none">
      <h3 className="text-section-title text-ink">Operator Replay</h3>
      {hasActiveReplay && (
        <p className="mt-2 rounded-control bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning-text">
          An active replay is currently in progress for this notification.
        </p>
      )}
      {replayMutation.isSuccess && replayMutation.data && (
        <p className="mt-2 rounded-control bg-success-soft px-2.5 py-1.5 text-[12px] text-success-text">
          Replay requested. New notification:{' '}
          <Link to={`/notifications/${replayMutation.data.notificationId}`} className="font-mono underline hover:text-success-text">
            {replayMutation.data.notificationId.slice(0, 8)}…
          </Link>
        </p>
      )}
      {!hasActiveReplay && !replayMutation.isSuccess && !open && (
        <Button className="mt-2" size="sm" onClick={() => setOpen(true)}>Replay notification</Button>
      )}
      {!hasActiveReplay && !replayMutation.isSuccess && open && (
        <div className="mt-2 space-y-2">
          <div>
            <label htmlFor="replay-reason" className="field-label">Reason (optional)</label>
            <input id="replay-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. SMTP server recovered" className="field-control mt-1 w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={submit} disabled={replayMutation.isPending}>
              {replayMutation.isPending ? 'Replaying…' : 'Submit Replay'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setOpen(false); setReason(''); }} disabled={replayMutation.isPending}>
              Cancel
            </Button>
          </div>
          {replayMutation.isError && (
            <p role="alert" className="rounded-control bg-error-soft px-2.5 py-1.5 text-[12px] text-error-text">
              {replayMutation.error instanceof ApiRequestError ? replayMutation.error.message : 'Replay failed. Please try again.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Replay history ──────────────────────────────────────────

function ReplayHistoryCard({ notificationId, now }: { notificationId: string; now: number }) {
  const { data: replays, isLoading } = useReplayHistory(notificationId);

  if (isLoading) return <Card title="Replay history" subtitle="Operator attempts to re-deliver this notification"><LoadingSkeleton rows={2} /></Card>;
  if (!replays || replays.length === 0) return null;

  return (
    <Card title="Replay history" subtitle="Operator attempts to re-deliver this notification">
      <ul role="list" className="divide-y divide-line">
        {replays.map((r) => (
          <li key={r.replayId} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[10px] text-ink-faint">
                <time dateTime={r.createdAt} title={formatDateTime(r.createdAt)}>{formatRelativeTimePrecise(r.createdAt, now)}</time>
                {r.triggeredBy && <span> · {r.triggeredBy}</span>}
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  r.status === 'COMPLETED' ? 'bg-success-soft text-success-text' :
                  r.status === 'RUNNING' ? 'bg-primary-soft text-primary-text' :
                  r.status === 'FAILED' ? 'bg-error-soft text-error-text' :
                  'bg-elevated text-ink-muted'
                }`}>
                  {r.status}
                </span>
                {r.newNotificationStatus && (
                  <StatusBadge status={r.newNotificationStatus as NotificationStatus} size="sm" />
                )}
              </div>
            </div>
            {r.reason && <p className="mt-1 text-[12px] text-ink">{r.reason}</p>}
            {r.errorMessage && (
              <p className="mt-1 rounded bg-error-soft px-2 py-1 font-mono text-[11px] text-error-text">
                {r.errorMessage}
              </p>
            )}
            {r.newNotificationId && (
              <Link to={`/notifications/${r.newNotificationId}`} className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-primary transition-colors hover:underline">
                View replayed notification ({r.newNotificationId.slice(0, 8)}…) <span aria-hidden="true">→</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── Loading skeleton ────────────────────────────────────────

function DetailSkeleton() {
  const pulse = 'animate-pulse rounded bg-elevated';
  return (
    <div aria-busy="true" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className={`h-6 w-48 ${pulse}`} />
          <div className={`h-3.5 w-56 ${pulse}`} />
        </div>
        <div className="flex gap-2">
          <div className={`h-7 w-32 ${pulse}`} />
          <div className={`h-7 w-36 ${pulse}`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-surface px-3.5 py-2">
            <div className={`h-3 w-12 ${pulse}`} />
            <div className={`mt-1.5 h-3.5 w-20 ${pulse}`} />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="rounded-card border border-line bg-surface p-4"><LoadingSkeleton rows={4} /></div>
        <div className="rounded-card border border-line bg-surface p-4"><LoadingSkeleton rows={4} /></div>
      </div>
      <div className="rounded-card border border-line bg-surface p-4"><LoadingSkeleton rows={3} /></div>
      <span className="sr-only" role="status">Loading notification…</span>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export function NotificationDetailPage() {
  const { notificationId } = useParams<{ notificationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = notificationId ?? '';
  const now = useNow();

  const { data, isLoading, isError, error, refetch } = useNotification(id);
  const { data: timelineEvents } = useTimeline(id);
  const { data: replays } = useReplayHistory(id);

  const hasActiveReplay = Boolean(replays?.some((r) => r.status === 'REQUESTED' || r.status === 'RUNNING'));

  const isNotFound = isError && error instanceof ApiRequestError && error.status === 404;

  const handleReplayed = () => {
    queryClient.invalidateQueries({ queryKey: ['notification', id] });
    queryClient.invalidateQueries({ queryKey: ['timeline', id] });
    queryClient.invalidateQueries({ queryKey: ['replays', id] });
    queryClient.invalidateQueries({ queryKey: ['dead-letter', id] });
  };

  const focusReplay = () => {
    const el = document.getElementById('replay-section');
    el?.scrollIntoView({ block: 'nearest' });
    el?.focus();
  };

  return (
    <div className="space-y-4">
      {isLoading && <DetailSkeleton />}

      {isError && isNotFound && (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState headingLevel="h1" title="Notification not found" message="This notification may have been deleted or the ID may be invalid."
            action={<Button variant="secondary" size="sm" onClick={() => navigate('/notifications')}>Back to notifications</Button>}
          />
        </div>
      )}

      {isError && !isNotFound && (
        <ErrorState headingLevel="h1" title="Unable to load notification" message="We couldn't retrieve this notification right now." onRetry={refetch} />
      )}

      {!isLoading && !isError && data && (
        <>
          <PageHeader
            title={
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                Notification
                <StatusBadge status={data.status} withDot />
              </span>
            }
            description={
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="font-mono text-[11px] text-ink-faint" title={data.id}>{data.id.slice(0, 8)}…</span>
                <span aria-hidden="true" className="text-ink-faint">·</span>
                <span>
                  Created{' '}
                  <time dateTime={data.createdAt} title={formatDateTime(data.createdAt)}>{formatRelativeTimePrecise(data.createdAt, now)}</time>
                </span>
              </span>
            }
            actions={
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => navigate('/notifications')}>
                  <span aria-hidden="true">←</span> Back
                </Button>
                {isReplayable(data.status) && (
                  <Button size="sm" onClick={focusReplay}>Replay</Button>
                )}
              </div>
            }
          />

          {/* Notification Identity / Status */}
          <section aria-label="Notification summary" className="overflow-hidden rounded-card border border-line bg-surface">
            <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-6">
              <SummaryCell label="Status"><StatusBadge status={data.status} size="sm" /></SummaryCell>
              <SummaryCell label="Channel"><ChannelBadge channel={data.channel} /></SummaryCell>
              <SummaryCell label="Category"><CategoryBadge category={data.category} /></SummaryCell>
              <SummaryCell label="Priority"><PriorityBadge priority={data.priority} /></SummaryCell>
              <SummaryCell label="Created"><SummaryTime iso={data.createdAt} now={now} /></SummaryCell>
              <SummaryCell label="Updated"><SummaryTime iso={data.updatedAt} now={now} /></SummaryCell>
            </dl>
          </section>

          {/* Delivery Lifecycle + Technical Details (two-column on desktop) */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Card title="Delivery lifecycle" subtitle="Events recorded for this notification" className="overflow-hidden min-w-0">
              <TimelineView notificationId={id} />
            </Card>
            <Card title="Technical details" subtitle="Identifiers and timestamps" className="min-w-0">
              <dl className="space-y-2">
                <TechRow label="Notification ID"><CopyableId id={data.id} label="notification ID" /></TechRow>
                <TechRow label="User ID"><CopyableId id={data.userId} label="user ID" /></TechRow>
                <TechRow label="Template ID"><CopyableId id={data.templateId} label="template ID" /></TechRow>
                <TechRow label="Created">
                  <time dateTime={data.createdAt} title={formatDateTime(data.createdAt)} className="text-[13px] text-ink">
                    {formatRelativeTimePrecise(data.createdAt, now)}
                  </time>
                </TechRow>
                <TechRow label="Updated">
                  <time dateTime={data.updatedAt} title={formatDateTime(data.updatedAt)} className="text-[13px] text-ink">
                    {formatRelativeTimePrecise(data.updatedAt, now)}
                  </time>
                </TechRow>
              </dl>
            </Card>
          </div>

          {/* Payload */}
          <div>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">Payload</p>
            <JsonViewer data={data.payload} label="Payload JSON" defaultExpanded={Object.keys(data.payload).length > 0} />
          </div>

          {/* Dead-Letter Record (DLQ) */}
          <DeadLetterCard notificationId={id} status={data.status} />

          {/* Failure Information (conditional) */}
          <FailureCard status={data.status} events={timelineEvents} />

          {/* Replay Action + History */}
          <div className="space-y-4">
            <ReplaySection notificationId={id} status={data.status} hasActiveReplay={hasActiveReplay} onReplayed={handleReplayed} />
            <ReplayHistoryCard notificationId={id} now={now} />
          </div>
        </>
      )}
    </div>
  );
}
