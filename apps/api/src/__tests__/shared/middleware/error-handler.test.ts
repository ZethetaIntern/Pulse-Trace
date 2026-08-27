import { Request, Response } from 'express';
import { errorHandler } from '../../../shared/middleware/error-handler';
import { HttpError } from '../../../shared/errors/http-error';

function createMockResponse(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('errorHandler', () => {
  const mockReq = { requestId: 'test-req-id-123', method: 'GET', originalUrl: '/test' } as unknown as Request;
  const mockNext = jest.fn();

  beforeEach(() => {
    mockNext.mockClear();
    delete process.env.NODE_ENV;
  });

  it('returns 500 for generic errors', () => {
    const res = createMockResponse();
    const error = new Error('Something broke');

    errorHandler(error, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Something broke',
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
        }),
      }),
    );
  });

  it('uses statusCode from HttpError', () => {
    const res = createMockResponse();
    const error = new HttpError('Not found', 404, 'NOT_FOUND');

    errorHandler(error, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Not found',
        error: expect.objectContaining({
          code: 'NOT_FOUND',
        }),
      }),
    );
  });

  it('includes details when present', () => {
    const res = createMockResponse();
    const error = new HttpError('Validation failed', 400, 'INVALID_REQUEST', [
      { field: 'userId', message: 'is required' },
    ]);

    errorHandler(error, mockReq, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'INVALID_REQUEST',
          details: [{ field: 'userId', message: 'is required' }],
        }),
      }),
    );
  });

  it('omits details when empty array', () => {
    const res = createMockResponse();
    const error = new HttpError('Error', 400, 'ERROR', []);

    errorHandler(error, mockReq, res, mockNext);

    const callArgs = (res.json as jest.Mock).mock.calls[0][0];
    expect(callArgs.error).not.toHaveProperty('details');
  });

  it('includes requestId in error response', () => {
    const res = createMockResponse();
    const error = new Error('Something broke');

    errorHandler(error, mockReq, res, mockNext);

    const callArgs = (res.json as jest.Mock).mock.calls[0][0];
    expect(callArgs.error.requestId).toBe('test-req-id-123');
  });

  it('includes requestId when requestId is undefined (graceful degradation)', () => {
    const reqWithoutId = { method: 'GET', originalUrl: '/test' } as unknown as Request;
    const res = createMockResponse();
    const error = new Error('Something broke');

    errorHandler(error, reqWithoutId, res, mockNext);

    const callArgs = (res.json as jest.Mock).mock.calls[0][0];
    expect(callArgs.error.requestId).toBeUndefined();
  });

  it('includes stack trace in development mode', () => {
    process.env.NODE_ENV = 'development';
    const res = createMockResponse();
    const error = new Error('Dev error');

    errorHandler(error, mockReq, res, mockNext);

    const callArgs = (res.json as jest.Mock).mock.calls[0][0];
    expect(callArgs).toHaveProperty('stack');
  });

  it('excludes stack trace in production mode', () => {
    process.env.NODE_ENV = 'production';
    const res = createMockResponse();
    const error = new Error('Prod error');

    errorHandler(error, mockReq, res, mockNext);

    const callArgs = (res.json as jest.Mock).mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('stack');
  });

  it('uses default message when error has no message', () => {
    const res = createMockResponse();
    const error = { statusCode: 400, code: 'TEST' } as unknown as Error;

    errorHandler(error, mockReq, res, mockNext);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Internal Server Error',
      }),
    );
  });
});
