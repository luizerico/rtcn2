/**
 * Shared API error helpers.
 * Controllers/middleware should use these instead of hand-rolled JSON bodies.
 * Exception details stay server-side; clients get stable `message` + `code` only.
 */

const ERROR_CODES = Object.freeze({
  NO_TOKEN: 'NO_TOKEN',
  EXPIRED: 'EXPIRED',
  INVALID: 'INVALID',
  REVOKED: 'REVOKED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  NOT_VERIFIED: 'NOT_VERIFIED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION: 'VALIDATION',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL: 'INTERNAL',
  CONFIG: 'CONFIG',
});

class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message Client-safe message
   * @param {{ code?: string, details?: Record<string, unknown>, cause?: unknown }} [options]
   */
  constructor(status, message, options = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = options.code;
    this.details = options.details && typeof options.details === 'object' ? options.details : undefined;
    this.cause = options.cause;
    this.isOperational = true;
  }
}

/**
 * Write a stable client-facing error body (no exception internals).
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} message
 * @param {{ code?: string, [key: string]: unknown }} [options]
 */
function sendError(res, status, message, options = {}) {
  // Allow bare string code: sendError(res, 404, '…', ERROR_CODES.NOT_FOUND)
  const opts = typeof options === 'string' ? { code: options } : options || {};
  const { code, details, ...extras } = opts;
  const body = { message };
  if (code) {
    body.code = code;
  }
  const detailPayload =
    details && typeof details === 'object'
      ? { ...details, ...extras }
      : Object.keys(extras).length
        ? extras
        : undefined;
  if (detailPayload && Object.keys(detailPayload).length > 0) {
    body.details = detailPayload;
  }
  return res.status(status).json(body);
}

/**
 * Log a server exception and respond with a stable message + code.
 * @param {import('express').Response} res
 * @param {unknown} error
 * @param {string} message
 * @param {{ status?: number, code?: string }} [options]
 */
function sendServerError(res, error, message, { status = 500, code = 'INTERNAL' } = {}) {
  console.error(message, error);
  return sendError(res, status, message, { code });
}

/**
 * Wrap an async route handler so rejected promises reach Express error middleware.
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<unknown>} fn
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  ERROR_CODES,
  HttpError,
  sendError,
  sendServerError,
  asyncHandler,
};
