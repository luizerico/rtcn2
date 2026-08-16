const { recordAction } = require('../services/actionLogService');

const SKIP_PREFIXES = ['/api/health', '/api/logs'];

function shouldLogRequest(req) {
  const path = req.originalUrl || req.url || '';
  if (!path.startsWith('/api')) return false;
  if (SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}/`))) {
    return false;
  }

  const method = String(req.method || 'GET').toUpperCase();
  // Mutating requests are user actions; auth login/register are POSTs.
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    return true;
  }
  return false;
}

function requestMeta(req) {
  return {
    userAgent: req.get('user-agent') || '',
    ipAddress: req.ip || req.socket?.remoteAddress || '',
    clientApp: req.get('x-client-app') || 'rbac-platform',
  };
}

/**
 * After response finishes, persist an action log for mutating API calls.
 * Attach early in the Express stack so finish still fires with final status.
 */
function actionLogMiddleware(req, res, next) {
  if (!shouldLogRequest(req)) {
    return next();
  }

  const startedAt = Date.now();

  res.on('finish', () => {
    const meta = requestMeta(req);
    const bodyKeys =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? Object.keys(req.body).filter((key) => !['password', 'token', 'resetToken', 'resetTokenHash', 'currentPassword', 'newPassword'].includes(key))
        : [];

    void recordAction({
      userId: req.actionLogContext?.userId || req.user?._id || null,
      username:
        req.actionLogContext?.username ||
        req.user?.username ||
        req.body?.username ||
        req.body?.email ||
        '',
      action: req.actionLogContext?.action,
      resourceType: req.actionLogContext?.resourceType,
      resourceId: req.actionLogContext?.resourceId,
      method: req.method,
      path: (req.originalUrl || req.url || '').split('?')[0],
      statusCode: res.statusCode,
      success: res.statusCode >= 200 && res.statusCode < 400,
      message: req.actionLogContext?.message,
      ...meta,
      meta: {
        durationMs: Date.now() - startedAt,
        bodyKeys,
        query: req.query || {},
        ...(req.actionLogContext?.meta && typeof req.actionLogContext.meta === 'object'
          ? req.actionLogContext.meta
          : {}),
      },
    });
  });

  next();
}

module.exports = {
  actionLogMiddleware,
  shouldLogRequest,
};
