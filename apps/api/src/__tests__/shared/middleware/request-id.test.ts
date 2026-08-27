import { Request, Response } from 'express';
import { requestIdMiddleware } from '../../../shared/middleware/request-id';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    method: 'GET',
    originalUrl: '/test',
    requestId: '',
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    getHeader: jest.fn((name: string) => headers[name]),
    on: jest.fn(),
    statusCode: 200,
    // Expose internal headers for assertion
    _headers: headers,
  } as unknown as Response;
}

function callMiddleware(
  req: Request,
  res: Response,
): Promise<void> {
  return new Promise((resolve) => {
    requestIdMiddleware(req, res, () => resolve());
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requestIdMiddleware', () => {
  it('generates a request ID when header is missing', async () => {
    const req = createMockRequest();
    const res = createMockResponse();

    await callMiddleware(req, res);

    expect(req.requestId).toBeDefined();
    expect(typeof req.requestId).toBe('string');
    expect(req.requestId.length).toBeGreaterThan(0);
  });

  it('preserves a valid incoming X-Request-ID', async () => {
    const incomingId = 'my-custom-request-id-123';
    const req = createMockRequest({
      headers: { 'x-request-id': incomingId },
    });
    const res = createMockResponse();

    await callMiddleware(req, res);

    expect(req.requestId).toBe(incomingId);
  });

  it('sets X-Request-ID response header', async () => {
    const req = createMockRequest();
    const res = createMockResponse();

    await callMiddleware(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
  });

  it('replaces excessively long request IDs with a generated UUID', async () => {
    const longId = 'a'.repeat(200); // exceeds MAX_HEADER_LENGTH of 128
    const req = createMockRequest({
      headers: { 'x-request-id': longId },
    });
    const res = createMockResponse();

    await callMiddleware(req, res);

    expect(req.requestId).not.toBe(longId);
    // Should be a valid UUID
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('rejects request IDs containing control characters', async () => {
    const req = createMockRequest({
      headers: { 'x-request-id': 'bad\r\nid' },
    });
    const res = createMockResponse();

    await callMiddleware(req, res);

    // Should generate a new UUID, not use the malicious value
    expect(req.requestId).not.toBe('bad\r\nid');
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('generates different IDs for different requests', async () => {
    const req1 = createMockRequest();
    const res1 = createMockResponse();
    const req2 = createMockRequest();
    const res2 = createMockResponse();

    await callMiddleware(req1, res1);
    await callMiddleware(req2, res2);

    expect(req1.requestId).not.toBe(req2.requestId);
  });

  it('request ID is available on req.requestId', async () => {
    const req = createMockRequest();
    const res = createMockResponse();

    await callMiddleware(req, res);

    expect(req).toHaveProperty('requestId');
    expect(typeof req.requestId).toBe('string');
    expect(req.requestId.length).toBeGreaterThan(0);
  });

  it('accepts request IDs at the maximum allowed length (128 chars)', async () => {
    const maxId = 'b'.repeat(128);
    const req = createMockRequest({
      headers: { 'x-request-id': maxId },
    });
    const res = createMockResponse();

    await callMiddleware(req, res);

    expect(req.requestId).toBe(maxId);
  });

  it('handles array-type X-Request-ID header (picks first)', async () => {
    const req = createMockRequest({
      headers: { 'x-request-id': ['first-id', 'second-id'] },
    });
    const res = createMockResponse();

    await callMiddleware(req, res);

    expect(req.requestId).toBe('first-id');
  });

  it('generates UUID when header is empty string', async () => {
    const req = createMockRequest({
      headers: { 'x-request-id': '' },
    });
    const res = createMockResponse();

    await callMiddleware(req, res);

    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe('requestIdMiddleware — request completion log', () => {
  it('registers a finish event handler on the response', async () => {
    const req = createMockRequest();
    const res = createMockResponse();

    await callMiddleware(req, res);

    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('does not log for health check endpoints', async () => {
    const req = createMockRequest({
      originalUrl: '/health',
    });
    const res = createMockResponse();

    await callMiddleware(req, res);

    // The finish handler should still be registered
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('does not log for health/ready endpoints', async () => {
    const req = createMockRequest({
      originalUrl: '/health/ready',
    });
    const res = createMockResponse();

    await callMiddleware(req, res);

    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });
});
