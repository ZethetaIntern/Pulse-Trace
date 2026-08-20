import { useTimeline } from '../hooks/useNotifications';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorState } from './ErrorState';
import { EmptyState } from './EmptyState';
import type { TimelineEventResponse } from '../types';

// Event type → visual category for color coding
const EVENT_CATEGORY: Record<string, { color: string; label: string }> = {
  NOTIFICATION_CREATED: { color: 'bg-blue-500', label: 'creation' },
  REQUEST_VALIDATED: { color: 'bg-blue-400', label: 'creation' },
  NOTIFICATION_STORED: { color: 'bg-blue-400', label: 'creation' },
  JOB_QUEUED: { color: 'bg-indigo-500', label: 'queue' },
  WORKER_STARTED: { color: 'bg-yellow-500', label: 'worker' },
  WORKER_COMPLETED: { color: 'bg-yellow-400', label: 'worker' },
  PREFERENCE_CHECKED: { color: 'bg-teal-500', label: 'processing' },
  TEMPLATE_RESOLVED: { color: 'bg-teal-400', label: 'processing' },
  TEMPLATE_RENDERED: { color: 'bg-teal-400', label: 'processing' },
  CHANNEL_SELECTED: { color: 'bg-teal-500', label: 'processing' },
  PROVIDER_INVOKED: { color: 'bg-orange-500', label: 'delivery' },
  DELIVERY_SUCCEEDED: { color: 'bg-green-500', label: 'delivery' },
  DELIVERY_FAILED: { color: 'bg-red-500', label: 'failure' },
  RETRY_SCHEDULED: { color: 'bg-orange-400', label: 'retry' },
  RETRY_STARTED: { color: 'bg-orange-400', label: 'retry' },
  DLQ_MOVED: { color: 'bg-purple-500', label: 'failure' },
  REPLAY_CREATED: { color: 'bg-purple-400', label: 'replay' },
  REPLAY_REQUESTED: { color: 'bg-purple-400', label: 'replay' },
  REPLAY_STARTED: { color: 'bg-purple-500', label: 'replay' },
  REPLAY_COMPLETED: { color: 'bg-purple-400', label: 'replay' },
};

const CATEGORY_STYLES: Record<string, string> = {
  creation: 'bg-blue-50 text-blue-700',
  queue: 'bg-indigo-50 text-indigo-700',
  worker: 'bg-yellow-50 text-yellow-700',
  processing: 'bg-teal-50 text-teal-700',
  delivery: 'bg-orange-50 text-orange-700',
  failure: 'bg-red-50 text-red-700',
  retry: 'bg-orange-50 text-orange-700',
  replay: 'bg-purple-50 text-purple-700',
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

function TimelineItem({ event, isLast }: { event: TimelineEventResponse; isLast: boolean }) {
  const category = EVENT_CATEGORY[event.event] ?? { color: 'bg-gray-400', label: 'other' };

  return (
    <div className="relative flex gap-4 pb-6">
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 h-full w-0.5 bg-gray-200" />
      )}
      {/* Dot */}
      <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ring-4 ring-white ${category.color}`} />
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{event.event}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLES[category.label] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {category.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-gray-500">{formatTimestamp(event.timestamp)}</p>
        {event.metadata && Object.keys(event.metadata).length > 0 && (
          <MetadataSummary metadata={event.metadata} />
        )}
      </div>
    </div>
  );
}

function MetadataSummary({ metadata }: { metadata: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1.5">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Show metadata
        </button>
      ) : (
        <div className="rounded bg-gray-50 p-2 text-xs">
          <div className="mb-1 flex justify-between">
            <span className="text-gray-500">Metadata</span>
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              Hide
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap text-gray-600">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';

export function TimelineView({ notificationId }: { notificationId: string }) {
  const { data: events, isLoading, isError, error, refetch } = useTimeline(notificationId);

  if (isLoading) return <LoadingSpinner message="Loading timeline..." />;
  if (isError)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load timeline'}
        onRetry={refetch}
      />
    );
  if (!events || events.length === 0) return <EmptyState message="No events recorded yet." />;

  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-gray-900 uppercase tracking-wider">
        Timeline
      </h3>
      <div className="pl-1">
        {events.map((event, i) => (
          <TimelineItem key={i} event={event} isLast={i === events.length - 1} />
        ))}
      </div>
    </div>
  );
}
