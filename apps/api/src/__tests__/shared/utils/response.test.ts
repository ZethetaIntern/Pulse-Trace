import { Response } from 'express';
import { sendSuccess, sendError } from '../../../shared/utils/response';

function createMockResponse(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('sendSuccess', () => {
  it('sends 200 by default', () => {
    const res = createMockResponse();
    sendSuccess(res, { id: 1 });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Success',
      data: { id: 1 },
    });
  });

  it('uses custom message', () => {
    const res = createMockResponse();
    sendSuccess(res, { id: 1 }, 'Custom message');

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Custom message',
      data: { id: 1 },
    });
  });

  it('uses custom status code', () => {
    const res = createMockResponse();
    sendSuccess(res, { id: 1 }, 'Created', 201);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Created',
      data: { id: 1 },
    });
  });

  it('handles 202 status code', () => {
    const res = createMockResponse();
    sendSuccess(res, { id: 1 }, 'Accepted', 202);

    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('handles null data', () => {
    const res = createMockResponse();
    sendSuccess(res, null);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Success',
      data: null,
    });
  });

  it('handles array data', () => {
    const res = createMockResponse();
    sendSuccess(res, [1, 2, 3]);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Success',
      data: [1, 2, 3],
    });
  });
});

describe('sendError', () => {
  it('sends 500 by default', () => {
    const res = createMockResponse();
    sendError(res, 'Something went wrong');

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Something went wrong',
      error: undefined,
    });
  });

  it('uses custom status code', () => {
    const res = createMockResponse();
    sendError(res, 'Not found', 404);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Not found',
      error: undefined,
    });
  });

  it('includes error when provided', () => {
    const res = createMockResponse();
    const error = { code: 'TEST_ERROR', details: [] };
    sendError(res, 'Failed', 400, error);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed',
      error,
    });
  });

  it('handles 503 status code', () => {
    const res = createMockResponse();
    sendError(res, 'Service unavailable', 503);

    expect(res.status).toHaveBeenCalledWith(503);
  });
});
