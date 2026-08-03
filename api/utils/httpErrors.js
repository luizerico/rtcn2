/**
 * Client-facing API errors: stable message + code only.
 * Exception details stay server-side (console).
 */

function sendServerError(res, error, message, { status = 500, code = 'INTERNAL' } = {}) {
  console.error(message, error);
  return res.status(status).json({ message, code });
}

module.exports = { sendServerError };
