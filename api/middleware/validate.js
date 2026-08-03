const { ValidationError, collectValidationError } = require('../validation');

/**
 * Express middleware factory: run a sync validator(req) that may throw ValidationError.
 * Successful validators may return a value stored on `req.validated`.
 *
 * @param {(req: import('express').Request) => unknown} validator
 */
function validate(validator) {
  if (typeof validator !== 'function') {
    throw new TypeError('validate() requires a validator function');
  }

  return (req, res, next) => {
    try {
      const result = validator(req);
      if (result !== undefined) {
        req.validated = result;
      }
      return next();
    } catch (error) {
      const handled = collectValidationError(error);
      if (handled) {
        return res.status(handled.status).json(handled.body);
      }
      if (error instanceof ValidationError) {
        return res.status(400).json({ message: error.message, code: error.code });
      }
      return next(error);
    }
  };
}

module.exports = { validate };
