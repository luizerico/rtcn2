const { HttpError, sendError } = require('../utils/httpErrors');

/**
 * Express error middleware: format HttpError / unexpected failures without leaking internals.
 */
function errorHandler(err, _req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof HttpError || err?.isOperational) {
    const status = Number(err.status) || 500;
    if (status >= 500) {
      console.error(err.message, err.cause || err);
    }
    return sendError(res, status, err.message || 'Request failed.', {
      code: err.code,
      details: err.details,
    });
  }

  console.error('Unhandled error:', err);

  const status = Number(err.status || err.statusCode) || 500;
  if (status >= 400 && status < 500 && typeof err.message === 'string' && err.message) {
    return sendError(res, status, err.message, {
      code: err.code || 'BAD_REQUEST',
    });
  }

  return sendError(res, 500, 'Internal server error.', { code: 'INTERNAL' });
}

module.exports = {
  errorHandler,
};
