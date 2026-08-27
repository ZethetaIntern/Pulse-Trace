import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../../infrastructure/logger';

// ---------------------------------------------------------------------------
// Type augmentation — adds `requestId` to every Express Request
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Unique correlation ID for this HTTP request. */
      requestId: string;
    }
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum allowed length for a client-supplied X-Request-ID header. */
const MAX_HEADER_LENGTH = 128;

/**
 * Matches common control characters that must not appear in request IDs
 * (CRLF, tabs, null bytes, etc.).  We reject IDs containing these to
 * prevent header-injection attacks.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\x00-\x1f\x7f]/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a received value is safe to use as-is.
 * Rejects empty strings, values exceeding MAX_HEADER_LENGTH, and strings
 * containing control characters.
 */
function isValidIncomingId(id: string | undefined): id is string {
  if (!id || id.length === 0) return false;
  if (id.length > MAX_HEADER_LENGTH) return false;
  if (CONTROL_CHAR_REGEX.test(id)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Request-ID middleware.
 *
 * 1. Preserves a valid incoming `X-Request-ID` header.
 * 2. Generates `crypto.randomUUID()` when absent or invalid.
 * 3. Attaches the ID to `req.requestId`.
 * 4. Sets `X-Request-ID` on the response.
 * 5. Logs request completion with structured fields.
 *
 * Register **after** the JSON body parser so `req.method` and `req.originalUrl`
 * are available, but **before** any route handlers.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const raw = Array.isArray(incoming) ? incoming[0] : incoming;

  const requestId = isValidIncomingId(raw) ? raw : crypto.randomUUID();

  // Attach to request for downstream use (controllers, error handler, etc.)
  req.requestId = requestId;

  // Every HTTP response carries the correlation ID back to the caller.
  res.setHeader('X-Request-ID', requestId);

  // Record timing for request completion log.
  const startTime = Date.now();

  // Hook into the 'finish' event so we log *after* the response is sent.
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;

    // Suppress noisy logs for health checks — they fire frequently from
    // load balancers and contribute little diagnostic value.
    const path = req.originalUrl;
    const isHealthCheck = path === '/health' || path === '/health/ready';

    if (!isHealthCheck) {
      logger.info(
        {
          requestId,
          method: req.method,
          path,
          statusCode: res.statusCode,
          durationMs,
        },
        'HTTP request completed',
      );
    }
  });

  next();
}
