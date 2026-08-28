/**
 * Sanitizes error messages for safe storage in notification event metadata.
 *
 * Provider error messages may inadvertently contain credentials, connection
 * strings, HTTP headers, or other infrastructure details.  This function
 * strips known sensitive patterns while preserving useful diagnostic
 * information (error type, status codes, generic descriptions).
 *
 * The full error is still logged server-side via structured logging; only
 * the sanitized version is persisted in the event record and exposed
 * through the timeline API.
 */

/** Patterns that indicate sensitive data in error messages. */
const SENSITIVE_PATTERNS: RegExp[] = [
  // Connection strings: redis://user:pass@host, postgresql://user:pass@host
  // eslint-disable-next-line no-useless-escape
  /(?:redis|postgres(?:ql)?|mysql|mongodb|amqp|smtp):\/\/[^\s]*/gi,
  // Basic auth or bearer tokens in URLs or headers
  /(?:basic|bearer)\s+[A-Za-z0-9\-._~+/]+=*/gi,
  // API keys, tokens, secrets (common patterns)
  /(?:api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[:=]\s*\S+/gi,
  // AWS-style keys
  /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
  // Generic password patterns
  /password\s*[:=]\s*\S+/gi,
  // IP addresses with ports (may reveal internal infrastructure)
  /\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}(?::\d+)?\b/g,
];

/** Replacement text for stripped patterns. */
const REDACTED = '[REDACTED]';

/**
 * Strips sensitive patterns from an error message.
 * Returns a sanitized string safe for event metadata storage.
 */
export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  // Remove stack traces (everything after the first newline)
  const messageOnly = raw.split('\n')[0].trim();

  // Apply sensitive pattern redaction
  let sanitized = messageOnly;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, REDACTED);
  }

  // Cap length to prevent abuse via extremely long error messages
  const MAX_LENGTH = 500;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH) + '…';
  }

  return sanitized;
}
