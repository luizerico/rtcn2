/**
 * Google OAuth 2.0 (authorization code) helpers — no extra npm dependency.
 */

function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      (process.env.GOOGLE_REDIRECT_URI || process.env.CLIENT_URL)
  );
}

function redirectUri() {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const base = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/auth/google/callback`;
}

function buildGoogleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state: state || 'login',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * @param {string} code
 * @returns {Promise<{ access_token: string, id_token?: string }>}
 */
async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    const message = data.error_description || data.error || 'Google token exchange failed.';
    throw new Error(message);
  }
  return data;
}

/**
 * @param {string} accessToken
 * @returns {Promise<{ sub: string, email: string, email_verified?: boolean, name?: string, given_name?: string, picture?: string }>}
 */
async function fetchGoogleProfile(accessToken) {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Failed to load Google profile.');
  }
  if (!data.sub || !data.email) {
    throw new Error('Google profile missing subject or email.');
  }
  return data;
}

/**
 * Build a unique username from a Google email local-part.
 * @param {import('mongoose').Model} User
 * @param {string} email
 */
async function uniqueUsernameFromEmail(User, email) {
  const local = String(email)
    .split('@')[0]
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 24) || 'user';
  let candidate = local;
  let n = 0;
  while (await User.findOne({ username: candidate, deletedAt: null }).select('_id')) {
    n += 1;
    candidate = `${local}${n}`.slice(0, 32);
  }
  return candidate;
}

module.exports = {
  googleConfigured,
  redirectUri,
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleProfile,
  uniqueUsernameFromEmail,
};
