/**
 * Application error carrying an HTTP status code and a documented API error code.
 *
 * The global error middleware (shared/middleware/error-handler) maps instances of
 * this class to the standard error response shape defined in the API specification:
 *
 *   { "success": false, "message": "...", "error": { "code": "...", "details": [...] } }
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown[];

  constructor(message: string, statusCode: number, code: string, details: unknown[] = []) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
