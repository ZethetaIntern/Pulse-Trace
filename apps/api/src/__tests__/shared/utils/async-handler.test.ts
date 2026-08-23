import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/utils/async-handler';

describe('asyncHandler', () => {
  const mockReq = {} as Request;
  const mockRes = {} as Response;
  const mockNext = jest.fn();

  beforeEach(() => {
    mockNext.mockClear();
  });

  it('returns a RequestHandler function', () => {
    const handler = asyncHandler(async (_req, _res, _next) => {});
    expect(typeof handler).toBe('function');
  });

  it('calls the handler with req, res, next', async () => {
    const spy = jest.fn().mockResolvedValue(undefined);
    const handler = asyncHandler(spy);

    await handler(mockReq, mockRes, mockNext);

    expect(spy).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
  });

  it('forwards rejected promises to next()', async () => {
    const error = new Error('test error');
    const handler = asyncHandler(async () => {
      throw error;
    });

    await handler(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it('does not call next() when handler succeeds', async () => {
    const handler = asyncHandler(async (_req, _res, _next) => {
      // success
    });

    await handler(mockReq, mockRes, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
  });

  it('forwards async errors to next()', async () => {
    const handler = asyncHandler(async () => {
      throw new Error('async failure');
    });

    await handler(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ message: 'async failure' }));
  });
});
