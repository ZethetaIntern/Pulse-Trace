import type { ReactNode } from 'react';
import { resolveStatusTone, STATUS_TONE_DOT } from './status';
import type { NotificationStatus } from '../../types';
import type { InfrastructureStatus } from './status';

interface StatusDotProps {
  status: NotificationStatus | InfrastructureStatus;
  /** Optional text label rendered next to the dot. */
  label?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * A colored status dot with an optional text label.
 * The optional label keeps status visible to non-color sighted users
 * (no color-only communication); the dot is decorative (aria-hidden).
 */
export function StatusDot({ status, label, size = 'sm', className }: StatusDotProps) {
  const tone = resolveStatusTone(status);
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <span className={`inline-block shrink-0 rounded-full ${dotSize} ${STATUS_TONE_DOT[tone]}`} aria-hidden="true" />
      {label !== undefined && <span className="text-sm text-ink-muted">{label}</span>}
    </span>
  );
}