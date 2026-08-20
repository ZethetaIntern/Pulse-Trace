import type { NotificationStatus } from '../types';

const STATUS_STYLES: Record<NotificationStatus, string> = {
  CREATED: 'bg-gray-100 text-gray-700',
  QUEUED: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-yellow-100 text-yellow-700',
  DELIVERED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  RETRY_PENDING: 'bg-orange-100 text-orange-700',
  DLQ: 'bg-purple-100 text-purple-700',
  SKIPPED: 'bg-slate-100 text-slate-500',
};

export function StatusBadge({ status }: { status: NotificationStatus }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    LOW: 'bg-slate-100 text-slate-600',
    NORMAL: 'bg-blue-50 text-blue-600',
    HIGH: 'bg-orange-100 text-orange-700',
    CRITICAL: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[priority] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {priority}
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: string }) {
  const styles: Record<string, string> = {
    EMAIL: 'bg-indigo-50 text-indigo-700',
    SMS: 'bg-teal-50 text-teal-700',
    IN_APP: 'bg-amber-50 text-amber-700',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[channel] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {channel}
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const styles: Record<string, string> = {
    TRANSACTIONAL: 'bg-blue-50 text-blue-600',
    SECURITY: 'bg-red-50 text-red-600',
    SYSTEM: 'bg-gray-100 text-gray-600',
    INFORMATIONAL: 'bg-green-50 text-green-600',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[category] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {category}
    </span>
  );
}
