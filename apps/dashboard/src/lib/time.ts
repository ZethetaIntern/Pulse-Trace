import { useEffect, useState } from 'react';

/**
 * Hook that returns the current timestamp, updating on an interval.
 * Used for live relative-time displays.
 *
 * @param intervalMs - Update interval in milliseconds (default: 5000)
 * @returns Current timestamp in milliseconds
 */
export function useNow(intervalMs = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Format a timestamp as a relative time string (e.g., "5m ago", "2h ago").
 * Uses floor-based thresholds: "just now" for < 5s, then seconds, minutes, hours, days.
 * This variant is used by overview/summary pages (Overview, Monitoring, Analytics).
 *
 * @param time - Timestamp as number (ms since epoch) or ISO string
 * @param now - Current timestamp in milliseconds (from useNow)
 * @returns Relative time string, or '—' for invalid timestamps
 */
export function formatRelativeTime(time: number | string, now: number): string {
  const ts = typeof time === 'string' ? new Date(time).getTime() : time;
  if (!Number.isFinite(ts)) return '—';
  const diffMs = Math.max(0, now - ts);
  const s = Math.floor(diffMs / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Format a timestamp as a relative time string with round-based thresholds.
 * "just now" for ≤ 10s, shows seconds up to 45s, then minutes, hours, days.
 * This variant is used by detailed views (Notifications, NotificationDetail, TimelineView).
 *
 * @param time - Timestamp as number (ms since epoch) or ISO string
 * @param now - Current timestamp in milliseconds (from useNow)
 * @returns Relative time string, or '—' for invalid timestamps
 */
export function formatRelativeTimePrecise(time: number | string, now: number): string {
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

/**
 * Format an ISO timestamp as a localized date-time string.
 * Used for tooltip/title attributes on relative time elements.
 *
 * @param iso - ISO timestamp string
 * @returns Localized date-time string
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
