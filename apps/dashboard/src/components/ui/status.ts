import type { NotificationStatus } from '../../types';

/**
 * Shared status vocabulary for the PulseTrace design system.
 *
 * Two distinct domains, never mixed:
 *   - Notification lifecycle statuses (from the API enums).
 *   - Infrastructure statuses (health of API/Postgres/Redis/Queue/Worker).
 */
export type InfrastructureStatus = 'healthy' | 'degraded' | 'error' | 'running' | 'stopped';

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export const INFRASTRUCTURE_STATUSES: InfrastructureStatus[] = [
  'healthy',
  'degraded',
  'error',
  'running',
  'stopped',
];

/** Notification lifecycle → semantic tone. */
export const NOTIFICATION_STATUS_TONE: Record<NotificationStatus, StatusTone> = {
  CREATED: 'neutral',
  QUEUED: 'info',
  PROCESSING: 'info',
  DELIVERED: 'success',
  FAILED: 'error',
  RETRY_PENDING: 'warning',
  DLQ: 'error',
  SKIPPED: 'neutral',
};

/** Infrastructure status → semantic tone. */
export const INFRASTRUCTURE_STATUS_TONE: Record<InfrastructureStatus, StatusTone> = {
  healthy: 'success',
  running: 'success',
  degraded: 'warning',
  error: 'error',
  stopped: 'neutral',
};

/** Dot color per tone (e.g. `bg-success`). */
export const STATUS_TONE_DOT: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
  neutral: 'bg-neutral',
};

/** Badge surface per tone (soft background + readable text). */
export const STATUS_TONE_BADGE: Record<StatusTone, string> = {
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  error: 'bg-error-soft text-error-text',
  info: 'bg-info-soft text-info-text',
  neutral: 'bg-neutral-soft text-neutral-text',
};

export function isInfrastructureStatus(value: string): value is InfrastructureStatus {
  return (INFRASTRUCTURE_STATUSES as readonly string[]).includes(value);
}

/** Resolve any status value to a semantic tone. */
export function resolveStatusTone(status: NotificationStatus | InfrastructureStatus): StatusTone {
  if (isInfrastructureStatus(status)) {
    return INFRASTRUCTURE_STATUS_TONE[status];
  }
  return NOTIFICATION_STATUS_TONE[status as NotificationStatus] ?? 'neutral';
}

/** Human-readable label: infrastructure is capitalized, notifications verbatim. */
export function formatStatusLabel(status: string): string {
  if (isInfrastructureStatus(status)) {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
  return status;
}

/**
 * Map a raw health-check status from the monitoring API to the shared
 * infrastructure vocabulary. Check statuses are `ok | paused | stopped`.
 */
export function classifyCheckStatus(status: string): InfrastructureStatus {
  if (status === 'ok') return 'healthy';
  if (status === 'paused') return 'degraded';
  if (status === 'stopped') return 'stopped';
  return 'error';
}

/**
 * Map a raw worker status from the monitoring API to the shared
 * infrastructure vocabulary. Worker statuses are `running | paused | stopped`.
 */
export function classifyWorkerStatus(status: string): InfrastructureStatus {
  if (status === 'running') return 'running';
  if (status === 'paused') return 'degraded';
  if (status === 'stopped') return 'stopped';
  return 'error';
}

/** Human-readable label for a raw health-check status. */
export function formatCheckStatus(status: string): string {
  if (status === 'ok') return 'Healthy';
  if (status === 'paused') return 'Paused';
  if (status === 'stopped') return 'Stopped';
  return 'Error';
}