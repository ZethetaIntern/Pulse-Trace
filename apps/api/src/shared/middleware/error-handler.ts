import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown[];
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      ...(err.details && err.details.length > 0 ? { details: err.details } : {}),
    },
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
