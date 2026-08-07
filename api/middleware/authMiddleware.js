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

function authError(res, status, code, message) {
  return res.status(status).json({
    message,
    code,
  });
}

const protect = async (req, res, next) => {
  let token;

  if (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
  } else {
    return authError(res, 401, 'NO_TOKEN', 'Authentication required: no session token provided.');
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not configured.');
      return res.status(500).json({ message: 'Server authentication is misconfigured.', code: 'CONFIG' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return authError(res, 401, 'EXPIRED', 'Your session has expired. Please sign in again.');
      }
      return authError(res, 401, 'INVALID', 'Authentication failed: invalid session token.');
    }

    if (!decoded.sid) {
      return authError(res, 401, 'INVALID', 'Authentication failed: session id missing from token.');
    }

    const session = await findActiveSession(decoded.sid);
    if (!session) {
      return authError(res, 401, 'INVALID', 'Authentication failed: session not found.');
    }

    if (session.revokedAt) {
      return authError(
        res,
        401,
        'REVOKED',
        `Your session was disconnected${session.revokeReason ? ` (${session.revokeReason})` : ''}. Please sign in again.`
      );
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      return authError(res, 401, 'EXPIRED', 'Your session has expired. Please sign in again.');
    }

    if (session.tokenHash !== hashToken(token)) {
      return authError(res, 401, 'INVALID', 'Authentication failed: token does not match session.');
    }

    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      return authError(res, 401, 'USER_NOT_FOUND', 'Authentication failed: user no longer exists.');
    }

    if (!req.user.isVerified) {
      return authError(
        res,
        403,
        'NOT_VERIFIED',
        'Account is not verified. An administrator must set isVerified before you can use this session.'
      );
    }

    req.session = session;
    await touchSession(session);
    next();
  } catch (error) {
    console.error('Token Verification Error:', error.message);
    return authError(res, 401, 'INVALID', 'Authentication failed: token invalid or expired.');
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
        return authError(res, 401, 'NO_TOKEN', 'Authorization required.');
      }

      if (!permission || typeof permission !== 'string') {
        return res.status(500).json({ message: 'Authorization is misconfigured.', code: 'CONFIG' });
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
        return res.status(403).json({
          message: `Forbidden: Insufficient permissions for ${permission}.`,
          code: 'FORBIDDEN',
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
      return res.status(403).json({
        message: `Forbidden: Insufficient permissions for ${permission}.`,
        code: 'FORBIDDEN',
      });
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

module.exports = { protect, authorize, attachPermissions };
