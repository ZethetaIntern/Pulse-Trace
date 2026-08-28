import { sanitizeErrorMessage } from '../../../shared/utils/sanitize-error';

describe('sanitizeErrorMessage', () => {
  it('returns plain error messages unchanged', () => {
    expect(sanitizeErrorMessage(new Error('Connection refused'))).toBe('Connection refused');
  });

  it('converts non-Error values to string', () => {
    expect(sanitizeErrorMessage('string error')).toBe('string error');
    expect(sanitizeErrorMessage(42)).toBe('42');
    expect(sanitizeErrorMessage(null)).toBe('null');
    expect(sanitizeErrorMessage(undefined)).toBe('undefined');
  });

  it('redacts Redis connection strings', () => {
    const error = new Error('connect ECONNREFUSED redis://default:secret@redis:6379');
    const result = sanitizeErrorMessage(error);
    expect(result).not.toContain('secret');
    expect(result).not.toContain('redis://');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts PostgreSQL connection strings', () => {
    const error = new Error('connection to server failed: postgresql://admin:password123@db:5432');
    const result = sanitizeErrorMessage(error);
    expect(result).not.toContain('password123');
    expect(result).not.toContain('postgresql://');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts bearer tokens', () => {
    const error = new Error('HTTP 401: Invalid token bearer eyJhbGciOiJIUzI1NiJ9.test');
    const result = sanitizeErrorMessage(error);
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts API keys', () => {
    const error = new Error('auth failed: api_key=sk-1234567890abcdef');
    const result = sanitizeErrorMessage(error);
    expect(result).not.toContain('sk-1234567890abcdef');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts AWS access key IDs', () => {
    const error = new Error('Access denied AKIAIOSFODNN7EXAMPLE');
    const result = sanitizeErrorMessage(error);
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts password patterns', () => {
    const error = new Error('authentication failed: password=mysecret123');
    const result = sanitizeErrorMessage(error);
    expect(result).not.toContain('mysecret123');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts internal IP addresses with ports', () => {
    const error = new Error('timeout connecting to 192.168.1.100:5432');
    const result = sanitizeErrorMessage(error);
    expect(result).not.toContain('192.168.1.100');
    expect(result).toContain('[REDACTED]');
  });

  it('strips stack traces (multiline errors)', () => {
    const error = new Error('Something failed');
    error.stack = 'Error: Something failed\n    at Object.<anonymous> (/app/src/file.ts:10:5)\n    at Module._compile (internal/modules/cjs/loader:1198:14)';
    const result = sanitizeErrorMessage(error);
    expect(result).toBe('Something failed');
    expect(result).not.toContain('at Object');
    expect(result).not.toContain('/app/src/file.ts');
  });

  it('truncates excessively long messages', () => {
    const longMessage = 'A'.repeat(1000);
    const error = new Error(longMessage);
    const result = sanitizeErrorMessage(error);
    expect(result.length).toBeLessThanOrEqual(501); // 500 + ellipsis
    expect(result).toContain('…');
  });

  it('preserves useful error classification info', () => {
    const error = new Error('ECONNREFUSED: Connection refused to upstream');
    const result = sanitizeErrorMessage(error);
    expect(result).toContain('ECONNREFUSED');
    expect(result).toContain('Connection refused');
  });

  it('redacts multiple sensitive patterns in one message', () => {
    const error = new Error(
      'Failed: postgresql://admin:pass@host:5432 db, password=secret, api_key=abc123',
    );
    const result = sanitizeErrorMessage(error);
    expect(result).not.toContain('pass');
    expect(result).not.toContain('secret');
    expect(result).not.toContain('abc123');
    expect(result).not.toContain('postgresql://');
  });
});
