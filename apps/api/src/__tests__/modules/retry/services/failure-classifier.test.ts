import { HttpError } from '../../../../shared/errors/http-error';
import { FailureClassifier } from '../../../../modules/retry/services/failure-classifier';

describe('FailureClassifier Unit Tests', () => {
  describe('Retryable Transient Errors', () => {
    it('should classify HTTP 429 (Rate Limit) as retryable', () => {
      const err = new HttpError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED');
      const res = FailureClassifier.classify(err);
      expect(res.isRetryable).toBe(true);
      expect(res.errorCode).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should classify HTTP 500, 502, 503, 504 as retryable', () => {
      [500, 502, 503, 504].forEach((status) => {
        const err = new HttpError(`Server error ${status}`, status, 'SERVER_ERROR');
        const res = FailureClassifier.classify(err);
        expect(res.isRetryable).toBe(true);
      });
    });

    it('should classify Node.js network error codes (ETIMEDOUT, ECONNRESET, EAI_AGAIN) as retryable', () => {
      const codes = ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED'];
      codes.forEach((code) => {
        const err = new Error(`Network failure ${code}`);
        (err as any).code = code;
        const res = FailureClassifier.classify(err);
        expect(res.isRetryable).toBe(true);
        expect(res.errorCode).toBe(code);
      });
    });

    it('should classify message containing timeout or temporary outage as retryable', () => {
      const err = new Error('Provider connection timed out after 5000ms');
      const res = FailureClassifier.classify(err);
      expect(res.isRetryable).toBe(true);
      expect(res.errorCode).toBe('TRANSIENT_ERROR');
    });
  });

  describe('Permanent Non-Retryable Errors', () => {
    it('should classify USER_NOT_FOUND, TEMPLATE_NOT_FOUND, TEMPLATE_CHANNEL_MISMATCH as non-retryable', () => {
      const codes = ['USER_NOT_FOUND', 'TEMPLATE_NOT_FOUND', 'TEMPLATE_CHANNEL_MISMATCH'];
      codes.forEach((code) => {
        const err = new HttpError('Entity error', 400, code);
        const res = FailureClassifier.classify(err);
        expect(res.isRetryable).toBe(false);
        expect(res.errorCode).toBe(code);
      });
    });

    it('should classify HTTP 400, 401, 403, 404, 422 as non-retryable', () => {
      [400, 401, 403, 404, 422].forEach((status) => {
        const err = new HttpError(`Client error ${status}`, status, 'CLIENT_ERROR');
        const res = FailureClassifier.classify(err);
        expect(res.isRetryable).toBe(false);
      });
    });

    it('should classify unknown generic domain exceptions as non-retryable', () => {
      const err = new Error('Invalid template mustache expression');
      const res = FailureClassifier.classify(err);
      expect(res.isRetryable).toBe(false);
      expect(res.errorCode).toBe('PERMANENT_ERROR');
    });
  });
});
