import { Request, Response, NextFunction } from 'express';
import { logger } from '../../infrastructure/logger';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown[];
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const requestId = req.requestId;

  // Structured error log with correlation ID — no sensitive data included.
  logger.error(
    {
      err,
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
    },
    'Request failed',
  );

  res.status(statusCode).json({
    success: false,
    message,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      requestId,
      ...(err.details && err.details.length > 0 ? { details: err.details } : {}),
    },
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
