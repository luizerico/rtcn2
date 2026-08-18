const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  userHasPermission,
  listUserPermissions,
  listAccessibleResources,
  userIsAdminGroupMember,
} = require('../services/rbacService');
const {
  findActiveSession,
  touchSession,
  hashToken,
} = require('../services/sessionService');
const { sendError, ERROR_CODES } = require('../utils/httpErrors');
const { readSessionCookie } = require('../utils/sessionCookie');

function authError(res, status, code, message, extras = {}) {
  const options = { code };
  if (extras && Object.keys(extras).length > 0) {
    options.details = extras;
  }
  return sendError(res, status, message, options);
}

const protect = async (req, res, next) => {
  let token;

  if (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
  } else {
    token = readSessionCookie(req);
  }

  if (!token) {
    return authError(res, 401, ERROR_CODES.NO_TOKEN, 'Authentication required: no session token provided.');
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not configured.');
      return authError(res, 500, 'CONFIG', 'Server authentication is misconfigured.');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return authError(res, 401, ERROR_CODES.EXPIRED, 'Your session has expired. Please sign in again.');
      }
      return authError(res, 401, ERROR_CODES.INVALID, 'Authentication failed: invalid session token.');
    }

    if (!decoded.sid) {
      return authError(res, 401, ERROR_CODES.INVALID, 'Authentication failed: session id missing from token.');
    }

    const session = await findActiveSession(decoded.sid);
    if (!session) {
      return authError(res, 401, ERROR_CODES.INVALID, 'Authentication failed: session not found.');
    }

    if (session.revokedAt) {
      return authError(
        res,
        401,
        ERROR_CODES.REVOKED,
        `Your session was disconnected${session.revokeReason ? ` (${session.revokeReason})` : ''}. Please sign in again.`
      );
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      return authError(res, 401, ERROR_CODES.EXPIRED, 'Your session has expired. Please sign in again.');
    }

    if (session.tokenHash !== hashToken(token)) {
      return authError(res, 401, ERROR_CODES.INVALID, 'Authentication failed: token does not match session.');
    }

    req.user = await User.findById(decoded.id).select(
      '-password -resetTokenHash -verificationTokenHash'
    );
    if (!req.user || req.user.deletedAt) {
      return authError(res, 401, ERROR_CODES.USER_NOT_FOUND, 'Authentication failed: user no longer exists.');
    }

    if (!req.user.isVerified) {
      return authError(
        res,
        403,
        'NOT_VERIFIED',
        'Account is not verified. Check your email for a verification link, or ask an administrator to verify your account.'
      );
    }

    if (req.user.isEnabled === false) {
      return authError(
        res,
        403,
        ERROR_CODES.ACCOUNT_DISABLED,
        'This account is disabled. Ask an administrator to enable it.'
      );
    }

    req.authToken = token;
    req.session = session;
    await touchSession(session);
    next();
  } catch (error) {
    console.error('Token Verification Error:', error.message);
    return authError(res, 401, ERROR_CODES.INVALID, 'Authentication failed: token invalid or expired.');
  }
};

/**
 * @param {string} permission e.g. SURVEY:READ
 * @param {{ param?: string, allowAnyInstance?: boolean, classWideOnly?: boolean, attachAccessible?: boolean }} options
 */
const authorize = (permission, options = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return authError(res, 401, ERROR_CODES.NO_TOKEN, 'Authorization required.');
      }

      if (!permission || typeof permission !== 'string') {
        return authError(res, 500, 'CONFIG', 'Authorization is misconfigured.');
      }

      const checkOptions = {};
      if (options.param) {
        checkOptions.resourceId = req.params[options.param];
      }
      if (options.allowAnyInstance) {
        checkOptions.allowAnyInstance = true;
      }
      if (options.classWideOnly) {
        checkOptions.resourceId = undefined;
        checkOptions.allowAnyInstance = false;
      }

      const allowed = await userHasPermission(req.user, permission, checkOptions);
      if (!allowed) {
        return authError(res, 403, 'FORBIDDEN', `Forbidden: Insufficient permissions for ${permission}.`, {
          username: req.user.username,
          hint: 'Grant access to this class or specific database objects for one of your groups.',
        });
      }

      if (options.attachAccessible) {
        req.accessibleResources = await listAccessibleResources(req.user, permission);
      }

      next();
    } catch (error) {
      console.error('Authorization Error:', error.message);
      return authError(res, 403, 'FORBIDDEN', `Forbidden: Insufficient permissions for ${permission}.`);
    }
  };
};

const attachPermissions = async (req, res, next) => {
  try {
    req.permissions = await listUserPermissions(req.user);
    req.isAdmin = await userIsAdminGroupMember(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

/** Admin-group membership guard (identity admin pattern — not an asset permission row). */
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return authError(res, 401, ERROR_CODES.NO_TOKEN, 'Authorization required.');
    }
    const allowed = await userIsAdminGroupMember(req.user);
    if (!allowed) {
      return authError(res, 403, 'FORBIDDEN', 'Forbidden: Admin access required.');
    }
    req.isAdmin = true;
    return next();
  } catch (error) {
    console.error('Admin authorization Error:', error.message);
    return authError(res, 403, 'FORBIDDEN', 'Forbidden: Admin access required.');
  }
};

module.exports = { protect, authorize, requireAdmin, attachPermissions };
