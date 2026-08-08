const crypto = require('crypto');

/** Password-reset link lifetime (raw token is emailed; only the hash is stored). */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Email verification link lifetime. */
const VERIFICATION_TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * @param {string} token Raw token from the email link
 * @returns {string} SHA-256 hex digest for DB lookup
 */
function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/**
 * @param {number} [ttlMs]
 * @returns {{ raw: string, hash: string, expiresAt: Date }}
 */
function createToken(ttlMs = RESET_TOKEN_TTL_MS) {
  const raw = crypto.randomBytes(32).toString('base64url');
  return {
    raw,
    hash: hashResetToken(raw),
    expiresAt: new Date(Date.now() + ttlMs),
  };
}

/**
 * @returns {{ raw: string, hash: string, expiresAt: Date }}
 */
function createResetToken() {
  return createToken(RESET_TOKEN_TTL_MS);
}

/**
 * @returns {{ raw: string, hash: string, expiresAt: Date }}
 */
function createVerificationToken() {
  return createToken(VERIFICATION_TOKEN_TTL_MS);
}

module.exports = {
  RESET_TOKEN_TTL_MS,
  VERIFICATION_TOKEN_TTL_MS,
  hashResetToken,
  createToken,
  createResetToken,
  createVerificationToken,
};
