const COOKIE_NAME = 'rbac_session';

/**
 * Parse a Cookie header into a name→value map (no external dependency).
 * @param {string | undefined} header
 * @returns {Record<string, string>}
 */
function parseCookieHeader(header) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!header || typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

/**
 * @param {import('express').Request} req
 * @returns {string | null}
 */
function readSessionCookie(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const value = cookies[COOKIE_NAME];
  return value && typeof value === 'string' && value.length > 0 ? value : null;
}

function isSecureRequest(req) {
  if (process.env.COOKIE_SECURE === 'true' || process.env.COOKIE_SECURE === '1') {
    return true;
  }
  if (process.env.COOKIE_SECURE === 'false' || process.env.COOKIE_SECURE === '0') {
    return false;
  }
  return process.env.NODE_ENV === 'production' || Boolean(req.secure);
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} token JWT session token
 * @param {Date | string | number} [expiresAt]
 */
function setSessionCookie(req, res, token, expiresAt) {
  const maxAgeMs = expiresAt
    ? Math.max(0, new Date(expiresAt).getTime() - Date.now())
    : 60 * 60 * 1000;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  res.append('Set-Cookie', parts.join('; '));
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function clearSessionCookie(req, res) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  res.append('Set-Cookie', parts.join('; '));
}

module.exports = {
  COOKIE_NAME,
  parseCookieHeader,
  readSessionCookie,
  setSessionCookie,
  clearSessionCookie,
};
