/**
 * Shared API error helpers.
 * Controllers/middleware should use these instead of hand-rolled JSON bodies.
 * Exception details stay server-side; clients get stable `message` + `code` only.
 */

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
  const { code, ...extras } = options;
  const body = { message };
  if (code) {
    body.code = code;
  }
  for (const [key, value] of Object.entries(extras)) {
    if (value !== undefined) {
      body[key] = value;
    }
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
  HttpError,
  sendError,
  sendServerError,
  asyncHandler,
};
