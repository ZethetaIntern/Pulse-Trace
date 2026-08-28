import { HttpError } from '../../../../shared/errors/http-error';
import { validateTrendsQuery } from '../../../../modules/analytics/validators/analytics-validator';

describe('validateTrendsQuery', () => {
  it('returns defaults for empty query', () => {
    const result = validateTrendsQuery({});
    expect(result.interval).toBe('day');
    expect(result.from).toBeInstanceOf(Date);
    expect(result.to).toBeInstanceOf(Date);
    expect(result.from.getTime()).toBeLessThan(result.to.getTime());
  });

  it('accepts valid from/to dates', () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-01-31T00:00:00.000Z';
    const result = validateTrendsQuery({ from, to });
    expect(result.from.toISOString()).toBe(from);
    expect(result.to.toISOString()).toBe(to);
  });

  it('accepts all valid intervals', () => {
    for (const interval of ['hour', 'day', 'week', 'month'] as const) {
      const result = validateTrendsQuery({ interval });
      expect(result.interval).toBe(interval);
    }
  });

  it('defaults interval to day when omitted', () => {
    const result = validateTrendsQuery({});
    expect(result.interval).toBe('day');
  });

  it('rejects invalid interval', () => {
    expect(() => validateTrendsQuery({ interval: 'second' })).toThrow(HttpError);
  });

  it('defaults to day for non-string interval', () => {
    // typeof source.interval === 'string' check means non-strings fall through to default
    const result = validateTrendsQuery({ interval: 123 });
    expect(result.interval).toBe('day');
  });

  it('rejects invalid date string', () => {
    expect(() => validateTrendsQuery({ from: 'not-a-date' })).toThrow(HttpError);
  });

  it('rejects from after to', () => {
    expect(() =>
      validateTrendsQuery({
        from: '2026-12-31T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow(HttpError);
  });

  it('rejects from equal to to', () => {
    expect(() =>
      validateTrendsQuery({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow(HttpError);
  });

  it('accepts non-record query gracefully', () => {
    const result = validateTrendsQuery(null);
    expect(result.interval).toBe('day');
    expect(result.from).toBeInstanceOf(Date);
    expect(result.to).toBeInstanceOf(Date);
  });

  it('throws INVALID_REQUEST with details array', () => {
    try {
      validateTrendsQuery({ interval: 'invalid', from: 'bad-date' });
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.statusCode).toBe(400);
      expect(httpError.code).toBe('INVALID_REQUEST');
      expect(httpError.details.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('accepts empty string from/to as undefined (uses defaults)', () => {
    const result = validateTrendsQuery({ from: '', to: '' });
    expect(result.from).toBeInstanceOf(Date);
    expect(result.to).toBeInstanceOf(Date);
  });

  // ─── Date-range limit tests ───────────────────────────────────────────

  it('accepts a date range within the maximum limit (365 days)', () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-06-01T00:00:00.000Z'; // ~151 days
    const result = validateTrendsQuery({ from, to });
    expect(result.from.toISOString()).toBe(from);
    expect(result.to.toISOString()).toBe(to);
  });

  it('rejects a date range exceeding the maximum limit (365 days)', () => {
    const from = '2024-01-01T00:00:00.000Z';
    const to = '2026-01-02T00:00:00.000Z'; // > 365 days
    expect(() => validateTrendsQuery({ from, to })).toThrow(HttpError);
    try {
      validateTrendsQuery({ from, to });
    } catch (error) {
      const httpError = error as HttpError;
      expect(httpError.statusCode).toBe(400);
      expect(httpError.details.some((d) =>
        (d as { field: string; message: string }).message.includes('must not exceed'),
      )).toBe(true);
    }
  });

  it('accepts a range exactly at the default 365-day boundary minus one day', () => {
    // 364 days should be fine
    const now = new Date('2026-08-28T00:00:00.000Z');
    const from = new Date(now);
    from.setDate(from.getDate() - 364);
    const result = validateTrendsQuery({
      from: from.toISOString(),
      to: now.toISOString(),
    });
    expect(result.from).toBeInstanceOf(Date);
    expect(result.to).toBeInstanceOf(Date);
  });
});
