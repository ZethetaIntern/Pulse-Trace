import { HttpError } from '../../../shared/errors/http-error';
import { sanitizeErrorMessage } from '../../../shared/utils/sanitize-error';

export interface ErrorClassification {
  isRetryable: boolean;
  errorCode: string;
  errorMessage: string;
  errorDetails?: unknown;
}

const RETRYABLE_SYSTEM_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
  'ESOCKETTIMEDOUT',
  'EHOSTUNREACH',
  'EPIPE',
]);

const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

const RETRYABLE_ERROR_CODES = new Set([
  'QUEUE_UNAVAILABLE',
  'RATE_LIMIT_EXCEEDED',
  'PROVIDER_TIMEOUT',
  'SERVICE_UNAVAILABLE',
  'NETWORK_ERROR',
  'TRANSIENT_FAILURE',
]);

const PERMANENT_ERROR_CODES = new Set([
  'USER_NOT_FOUND',
  'TEMPLATE_NOT_FOUND',
  'TEMPLATE_CHANNEL_MISMATCH',
  'INVALID_REQUEST',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'BAD_REQUEST',
  'UNPROCESSABLE_ENTITY',
]);

export class FailureClassifier {
  /**
   * Classifies a failure into retryable transient vs permanent non-retryable.
   */
  static classify(error: unknown): ErrorClassification {
    const errorMessage = sanitizeErrorMessage(error);

    // 1. HttpError inspection
    if (error instanceof HttpError) {
      const isRetryable =
        RETRYABLE_HTTP_STATUSES.has(error.statusCode) ||
        RETRYABLE_ERROR_CODES.has(error.code);

      return {
        isRetryable,
        errorCode: error.code || `HTTP_${error.statusCode}`,
        errorMessage: error.message || errorMessage,
        errorDetails: error.details,
      };
    }

    // 2. Error object with status / statusCode / code properties
    if (error && typeof error === 'object') {
      const errObj = error as Record<string, unknown>;
      const code = typeof errObj.code === 'string' ? errObj.code : undefined;
      const status = typeof errObj.statusCode === 'number'
        ? errObj.statusCode
        : typeof errObj.status === 'number'
        ? errObj.status
        : undefined;

      if (code && RETRYABLE_SYSTEM_CODES.has(code)) {
        return {
          isRetryable: true,
          errorCode: code,
          errorMessage,
          errorDetails: errObj.details,
        };
      }

      if (code && RETRYABLE_ERROR_CODES.has(code)) {
        return {
          isRetryable: true,
          errorCode: code,
          errorMessage,
          errorDetails: errObj.details,
        };
      }

      if (code && PERMANENT_ERROR_CODES.has(code)) {
        return {
          isRetryable: false,
          errorCode: code,
          errorMessage,
          errorDetails: errObj.details,
        };
      }

      if (status !== undefined) {
        const isRetryable = RETRYABLE_HTTP_STATUSES.has(status);
        return {
          isRetryable,
          errorCode: code || `HTTP_${status}`,
          errorMessage,
          errorDetails: errObj.details,
        };
      }
    }

    // 3. String-based fallback heuristics for common Node.js / network error messages
    const lowerMessage = errorMessage.toLowerCase();
    if (
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('timed out') ||
      lowerMessage.includes('econnreset') ||
      lowerMessage.includes('etimedout') ||
      lowerMessage.includes('eai_again') ||
      lowerMessage.includes('rate limit') ||
      lowerMessage.includes('connection refused') ||
      lowerMessage.includes('temporary') ||
      lowerMessage.includes('service unavailable') ||
      lowerMessage.includes('503') ||
      lowerMessage.includes('502') ||
      lowerMessage.includes('504')
    ) {
      return {
        isRetryable: true,
        errorCode: 'TRANSIENT_ERROR',
        errorMessage,
      };
    }

    // Default: permanent / non-retryable failure
    return {
      isRetryable: false,
      errorCode: 'PERMANENT_ERROR',
      errorMessage,
    };
  }
}
