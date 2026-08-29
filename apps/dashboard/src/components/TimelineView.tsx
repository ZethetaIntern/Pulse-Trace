import { useEffect, useState } from 'react';
import { useTimeline } from '../hooks/useNotifications';
import { ErrorState } from './ErrorState';
import { EmptyState } from './EmptyState';
import { LoadingSkeleton } from './ui';
import { STATUS_TONE_BADGE, STATUS_TONE_DOT } from './ui/status';
import type { StatusTone } from './ui/status';
import type { TimelineEventResponse } from '../types';

/**
 * Delivery lifecycle timeline.
 *
 * Renders the real events returned by GET /notifications/:id/timeline.
 * No events are manufactured: unknown event names fall back to a neutral
 * presentation.
 */

// Real Prisma EventType vocabulary → semantic tone.
const EVENT_TONE: Record<string, StatusTone> = {
  NOTIFICATION_CREATED: 'neutral',
  REQUEST_VALIDATED: 'neutral',
  NOTIFICATION_STORED: 'neutral',
  JOB_QUEUED: 'info',
  WORKER_STARTED: 'info',
  PREFERENCE_CHECKED: 'info',
  TEMPLATE_RESOLVED: 'info',
  TEMPLATE_RENDERED: 'info',
  CHANNEL_SELECTED: 'info',
  PROVIDER_INVOKED: 'info',
  WORKER_COMPLETED: 'success',
  DELIVERY_SUCCEEDED: 'success',
  DELIVERY_FAILED: 'error',
  RETRY_SCHEDULED: 'warning',
  RETRY_STARTED: 'warning',
  DLQ_MOVED: 'error',
  REPLAY_CREATED: 'info',
  REPLAY_REQUESTED: 'info',
  REPLAY_STARTED: 'info',
  REPLAY_COMPLETED: 'info',
};

const EVENT_LABELS: Record<string, string> = {
  NOTIFICATION_CREATED: 'Notification created',
  REQUEST_VALIDATED: 'Request validated',
  NOTIFICATION_STORED: 'Notification stored',
  JOB_QUEUED: 'Job queued',
  WORKER_STARTED: 'Worker started',
  WORKER_COMPLETED: 'Worker completed',
  PREFERENCE_CHECKED: 'Preferences checked',
  TEMPLATE_RESOLVED: 'Template resolved',
  TEMPLATE_RENDERED: 'Template rendered',
  CHANNEL_SELECTED: 'Channel selected',
  PROVIDER_INVOKED: 'Provider invoked',
  DELIVERY_SUCCEEDED: 'Delivery succeeded',
  DELIVERY_FAILED: 'Delivery failed',
  RETRY_SCHEDULED: 'Retry scheduled',
  RETRY_STARTED: 'Retry started',
  DLQ_MOVED: 'Moved to dead-letter queue',
  REPLAY_CREATED: 'Replay created',
  REPLAY_REQUESTED: 'Replay requested',
  REPLAY_STARTED: 'Replay started',
  REPLAY_COMPLETED: 'Replay completed',
};

const EVENT_CHIP: Record<string, string> = {
  DELIVERY_SUCCEEDED: 'delivered',
  DELIVERY_FAILED: 'failed',
  RETRY_SCHEDULED: 'retry',
  RETRY_STARTED: 'retry',
  DLQ_MOVED: 'dlq',
  REPLAY_CREATED: 'replay',
  REPLAY_REQUESTED: 'replay',
  REPLAY_STARTED: 'replay',
  REPLAY_COMPLETED: 'replay',
};

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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function MetadataSummary({ metadata }: { metadata: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-meta text-ink-faint transition-colors hover:text-ink-muted"
        >
          Show metadata
        </button>
      ) : (
        <div className="rounded-control border border-line bg-sidebar p-2.5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-meta font-medium text-ink-muted">Metadata</span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-meta text-ink-faint transition-colors hover:text-ink-muted"
            >
              Hide
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-ink-muted">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function TimelineItem({
  event,
  isLast,
  now,
}: {
  event: TimelineEventResponse;
  isLast: boolean;
  now: number;
}) {
  const tone = EVENT_TONE[event.event] ?? 'neutral';
  const label = EVENT_LABELS[event.event] ?? event.event;
  const chip = EVENT_CHIP[event.event];

  return (
    <li className="relative flex gap-2.5 pb-4 last:pb-0">
      {!isLast && (
        <div aria-hidden="true" className="absolute left-[4.5px] top-4 h-full w-px bg-line" />
      )}
      <span
        aria-hidden="true"
        className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_TONE_DOT[tone]}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-medium text-ink" title={event.event}>
            {label}
          </span>
          {chip && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_TONE_BADGE[tone]}`}>
              {chip}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-meta text-ink-faint">
          <time dateTime={event.timestamp} title={formatDateTime(event.timestamp)}>
            {formatRelativeTime(event.timestamp, now)}
          </time>
        </p>
        {event.metadata && Object.keys(event.metadata).length > 0 && (
          <MetadataSummary metadata={event.metadata} />
        )}
      </div>
    </li>
  );
}

export function TimelineView({ notificationId }: { notificationId: string }) {
  const { data: events, isLoading, isError, refetch } = useTimeline(notificationId);
  const now = useNow();

  if (isLoading) {
    return (
      <div className="py-1">
        <LoadingSkeleton rows={4} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-2">
        <ErrorState
          title="Unable to load the timeline"
          message="We couldn't retrieve the delivery events for this notification."
          onRetry={refetch}
        />
      </div>
    );
  }
  if (!events || events.length === 0) {
    return <EmptyState compact message="No delivery events recorded yet." />;
  }

  return (
    <ul role="list" className="pl-1">
      {events.map((event, i) => (
        <TimelineItem key={i} event={event} isLast={i === events.length - 1} now={now} />
      ))}
    </ul>
  );
}
