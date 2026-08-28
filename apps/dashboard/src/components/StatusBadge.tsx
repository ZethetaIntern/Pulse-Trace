import type { NotificationStatus } from '../types';
import type { InfrastructureStatus, StatusTone } from './ui/status';
import { STATUS_TONE_BADGE, STATUS_TONE_DOT, formatStatusLabel, resolveStatusTone } from './ui/status';

interface StatusBadgeProps {
  status: NotificationStatus | InfrastructureStatus;
  /** Show a small leading status dot. */
  withDot?: boolean;
  size?: 'sm' | 'md';
}

const SIZES: Record<'sm' | 'md', string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-0.5 text-xs',
};

export function StatusBadge({ status, withDot = false, size = 'md' }: StatusBadgeProps) {
  const tone: StatusTone = resolveStatusTone(status);

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        SIZES[size],
        STATUS_TONE_BADGE[tone],
      ].join(' ')}
    >
      {withDot && (
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_TONE_DOT[tone]}`} aria-hidden="true" />
      )}
      {formatStatusLabel(status)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    LOW: 'bg-neutral-soft text-neutral-text',
    NORMAL: 'bg-info-soft text-info-text',
    HIGH: 'bg-warning-soft text-warning-text',
    CRITICAL: 'bg-error-soft text-error-text',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[priority] ?? 'bg-neutral-soft text-neutral-text'}`}
    >
      {priority}
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: string }) {
  const styles: Record<string, string> = {
    EMAIL: 'bg-indigo-50 text-indigo-700',
    SMS: 'bg-teal-50 text-teal-700',
    IN_APP: 'bg-warning-soft text-warning-text',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[channel] ?? 'bg-neutral-soft text-neutral-text'}`}
    >
      {channel}
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const styles: Record<string, string> = {
    TRANSACTIONAL: 'bg-info-soft text-info-text',
    SECURITY: 'bg-error-soft text-error-text',
    SYSTEM: 'bg-neutral-soft text-neutral-text',
    INFORMATIONAL: 'bg-success-soft text-success-text',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[category] ?? 'bg-neutral-soft text-neutral-text'}`}
    >
      {category}
    </span>
  );
}