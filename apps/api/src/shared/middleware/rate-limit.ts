import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { env } from '../../config/env';

/**
 * Standard rate-limit handler that returns the project's API error-response
 * shape so clients see a consistent { success, message, error } envelope.
 *
 * The response includes the X-Request-ID header (set by the request-id
 * middleware that runs earlier in the pipeline) and a Retry-After hint.
 */
function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    success: false,
    message: 'Too many requests — rate limit exceeded',
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(env.rateLimitWindowMs / 1000),
    },
  });
}

/**
 * Extracts a rate-limit key from the request.
 *
 * The app is configured with `app.set('trust proxy', 1)` (see app.ts), which
 * matches the nginx → API topology: nginx appends the real client IP as the
 * LAST X-Forwarded-For entry, and Express resolves `req.ip` from that entry.
 *
 * Client-supplied leftmost X-Forwarded-For values are therefore never used
 * for keying — trusting them would let attackers rotate spoofed IPs to
 * bypass the limiter.
 *
 * When no IP is available a static string is used so that all unknown-IP
 * requests share a single bucket (conservative for MVP).
 */
function keyGenerator(req: Request): string {
  return req.ip || 'unknown';
}

/**
 * Default rate limiter applied to mutating endpoints (POST, replay).
 * Uses the in-memory store — sufficient for a single-instance MVP.
 *
 * Health endpoints (/health, /health/ready) are registered BEFORE
 * the rate limiter in app.ts, so they are never rate-limited.
 */
export const apiRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true, // Return RateLimit-* headers (draft-6)
  legacyHeaders: false,  // Disable X-RateLimit-* headers
  handler: rateLimitHandler,
  keyGenerator,
  validate: {
    keyGeneratorIpFallback: false, // We handle forwarded-for ourselves.
  },
});
