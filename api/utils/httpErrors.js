/**
 * Standard client-facing API error JSON: { message, code, details? }.
 * Exception / stack details stay server-side (console) via sendServerError.
 */

const ERROR_CODES = Object.freeze({
  NO_TOKEN: 'NO_TOKEN',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  INVALID: 'INVALID',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  CONFIG: 'CONFIG',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL',
});

function hasDetails(details) {
  if (details == null) return false;
  if (typeof details !== 'object') return true;
  return Object.keys(details).length > 0;
}

function buildErrorBody(message, code, details) {
  const body = {
    message: String(message || 'Request failed.'),
    code: String(code || ERROR_CODES.INTERNAL),
  };
  if (hasDetails(details)) {
    body.details = details;
  }
  return body;
}

/**
 * Intentional client error (4xx / known auth failures). Never pass raw exceptions here.
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} message
 * @param {string} code
 * @param {unknown} [details]
 */
function sendError(res, status, message, code, details) {
  return res.status(status).json(buildErrorBody(message, code, details));
}

/**
 * Catch-block helper from #8: log the exception server-side, return { message, code } only.
 * @param {import('express').Response} res
 * @param {unknown} error
 * @param {string} message
 * @param {{ status?: number, code?: string }} [options]
 */
function sendServerError(res, error, message, { status = 500, code = ERROR_CODES.INTERNAL } = {}) {
  console.error(message, error);
  return sendError(res, status, message, code);
}

class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {string} code
   * @param {unknown} [details]
   */
  constructor(status, message, code, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isHttpError(err) {
  return (
    err instanceof HttpError ||
    (err &&
      typeof err.status === 'number' &&
      typeof err.code === 'string' &&
      typeof err.message === 'string')
  );
}

function errorHandler(err, _req, res, _next) {
  if (isHttpError(err)) {
    return sendError(res, err.status, err.message, err.code, err.details);
  }
  console.error('Unhandled error:', err);
  return sendError(res, 500, 'Internal server error.', ERROR_CODES.INTERNAL);
}

module.exports = {
  ERROR_CODES,
  buildErrorBody,
  sendError,
  sendServerError,
  HttpError,
  isHttpError,
  errorHandler,
};
