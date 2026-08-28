import express, { Request, Response } from 'express';
import { apiRateLimiter } from '../../../shared/middleware/rate-limit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal Express app that exposes the rate limiter on a specific
 * path, plus a /health route that is NOT rate-limited.
 *
 * We use a fresh app per test to avoid in-memory store leakage between tests.
 */
function createTestApp() {
  const app = express();

  // Simulate request-id middleware (attaches requestId and sets header).
  app.use((req: Request, res: Response, next) => {
    const incoming = req.headers['x-request-id'];
    const raw = Array.isArray(incoming) ? incoming[0] : incoming;
    req.requestId = (raw as string) || 'generated-id';
    res.setHeader('X-Request-ID', req.requestId);
    next();
  });

  // Health endpoint — should NOT be rate-limited.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Rate-limited POST endpoint.
  app.use('/api/v1/notifications', apiRateLimiter);
  app.post('/api/v1/notifications', (_req, res) => {
    res.status(202).json({ success: true, message: 'accepted' });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Rate Limiter', () => {
  it('allows requests under the rate limit', async () => {
    const app = createTestApp();

    // Make a few requests — should all succeed.
    for (let i = 0; i < 5; i++) {
      const res = await import('supertest').then((st) =>
        st.default(app).post('/api/v1/notifications').send({}),
      );
      expect(res.status).toBe(202);
    }
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const app = createTestApp();

    // Exhaust the rate limit. The default max is 100 from env, but in test
    // env the env module loads from the .env file. We set a small window via
    // the in-memory store by sending many requests rapidly.
    // Note: the env default is 100, so we send 101 requests.
    const requests = Array.from({ length: 101 }, () =>
      import('supertest').then((st) =>
        st.default(app).post('/api/v1/notifications').send({}),
      ),
    );

    const responses = await Promise.all(requests);
    const statusCodes = responses.map((r) => r.status);

    // At least one should be 429
    expect(statusCodes).toContain(429);

    // The 429 response should have the standard error shape
    const rateLimited = responses.find((r) => r.status === 429);
    expect(rateLimited).toBeDefined();
    expect(rateLimited!.body).toMatchObject({
      success: false,
      message: expect.stringContaining('rate limit'),
      error: expect.objectContaining({
        code: 'RATE_LIMIT_EXCEEDED',
      }),
    });
  });

  it('preserves X-Request-ID on 429 responses', async () => {
    const app = createTestApp();
    const customRequestId = 'test-rate-limit-request-id';

    // Exhaust the rate limit first
    const requests = Array.from({ length: 101 }, () =>
      import('supertest').then((st) =>
        st.default(app)
          .post('/api/v1/notifications')
          .set('X-Request-ID', customRequestId)
          .send({}),
      ),
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.find((r) => r.status === 429);

    expect(rateLimited).toBeDefined();
    // X-Request-ID should be present on the 429 response
    expect(rateLimited!.headers['x-request-id']).toBeDefined();
    expect(rateLimited!.headers['x-request-id']).toBe(customRequestId);
  });

  it('does not rate-limit GET /health', async () => {
    const app = createTestApp();

    // Send many requests to /health — should all succeed.
    for (let i = 0; i < 200; i++) {
      const res = await import('supertest').then((st) =>
        st.default(app).get('/health'),
      );
      expect(res.status).toBe(200);
    }
  });

  it('returns standard RateLimit headers', async () => {
    const app = createTestApp();

    const res = await import('supertest').then((st) =>
      st.default(app).post('/api/v1/notifications').send({}),
    );

    // express-rate-limit with standardHeaders: true returns RateLimit-* headers
    expect(res.headers['ratelimit-remaining']).toBeDefined();
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });

  it('GET requests to rate-limited paths are not blocked', async () => {
    // Create app with GET also going through the rate limiter middleware
    // but only POST is actually rate-limited (simulating app.ts behavior).
    const app = express();
    app.use((req: Request, res: Response, next) => {
      req.requestId = 'test-id';
      res.setHeader('X-Request-ID', req.requestId);
      next();
    });

    // Only POST goes through the rate limiter
    app.use('/api/v1/notifications', (req, res, next) => {
      if (req.method === 'POST') return apiRateLimiter(req, res, next);
      next();
    });

    app.get('/api/v1/notifications', (_req, res) => {
      res.json({ success: true, data: [] });
    });

    // Send many GET requests — should all succeed without being rate-limited
    for (let i = 0; i < 150; i++) {
      const res = await import('supertest').then((st) =>
        st.default(app).get('/api/v1/notifications'),
      );
      expect(res.status).toBe(200);
    }
  });
});
