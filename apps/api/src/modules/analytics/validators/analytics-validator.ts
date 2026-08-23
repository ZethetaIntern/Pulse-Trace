import { HttpError } from '../../../shared/errors/http-error';
import { TrendQuery } from '../interfaces/analytics-repository';

const VALID_INTERVALS: readonly TrendQuery['interval'][] = [
  'hour',
  'day',
  'week',
  'month',
];

interface ValidationDetail {
  field: string;
  message: string;
}

function failValidation(details: ValidationDetail[]): never {
  throw new HttpError('Validation failed', 400, 'INVALID_REQUEST', details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOptionalDate(value: unknown, field: string, details: ValidationDetail[]): Date | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') {
    details.push({ field, message: 'must be an ISO 8601 date string' });
    return undefined;
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    details.push({ field, message: 'must be a valid ISO 8601 date string' });
    return undefined;
  }
  return date;
}

/**
 * Validates the GET /api/v1/analytics/trends query parameters.
 * Returns a validated TrendQuery with from/to defaults and interval constraint.
 */
export function validateTrendsQuery(query: unknown): TrendQuery {
  const source = isRecord(query) ? query : {};
  const details: ValidationDetail[] = [];

  // Default: last 30 days
  const defaultTo = new Date();
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const from = parseOptionalDate(source.from, 'from', details) ?? defaultFrom;
  const to = parseOptionalDate(source.to, 'to', details) ?? defaultTo;

  // Validate from < to
  if (from.getTime() >= to.getTime()) {
    details.push({ field: 'from', message: 'must be before "to"' });
  }

  // Validate interval
  const rawInterval = typeof source.interval === 'string' ? source.interval : 'day';
  if (!(VALID_INTERVALS as readonly string[]).includes(rawInterval)) {
    details.push({
      field: 'interval',
      message: `must be one of: ${VALID_INTERVALS.join(', ')}`,
    });
  }

  if (details.length > 0) {
    failValidation(details);
  }

  return {
    from,
    to,
    interval: rawInterval as TrendQuery['interval'],
  };
}
