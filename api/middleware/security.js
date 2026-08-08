const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const isTestEnv = () => process.env.NODE_ENV === 'test';

/**
 * Baseline HTTP security headers.
 * CSP / COEP disabled so Next.js HTML in the unified server is not broken.
 */
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
}

/** Mild global limit for all /api traffic (skipped in Jest). */
function apiRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number.parseInt(process.env.API_RATE_LIMIT_MAX || '300', 10),
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTestEnv,
    message: { message: 'Too many requests, please try again later.' },
  });
}

/**
 * Stricter limit for password login (skipped in Jest).
 * Only failed/invalid login responses count toward the block.
 */
function authRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: isTestEnv,
    message: { message: 'Too many login attempts, please try again later.' },
  });
}

module.exports = {
  securityHeaders,
  apiRateLimiter,
  authRateLimiter,
};
