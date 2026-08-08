const crypto = require('crypto');

/** Password-reset link lifetime (raw token is emailed; only the hash is stored). */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * @param {string} token Raw reset token from the email link
 * @returns {string} SHA-256 hex digest for DB lookup
 */
function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/**
 * @returns {{ raw: string, hash: string, expiresAt: Date }}
 */
function createResetToken() {
  const raw = crypto.randomBytes(32).toString('base64url');
  return {
    raw,
    hash: hashResetToken(raw),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  };
}

module.exports = {
  RESET_TOKEN_TTL_MS,
  hashResetToken,
  createResetToken,
};
