const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { userHasPermission, listUserPermissions } = require('../services/rbacService');

/**
 * Protect routes by verifying the JWT Bearer token.
 */
const protect = async (req, res, next) => {
  let token;

  if (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
  } else {
    return res.status(401).json({ message: 'Authentication failed: No token provided.' });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not configured.');
      return res.status(500).json({ message: 'Server authentication is misconfigured.' });
    }

    const decoded = jwt.verify(token, secret);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'Authentication failed: User not found.' });
    }

    next();
  } catch (error) {
    console.error('Token Verification Error:', error.message);
    return res.status(401).json({ message: 'Authentication failed: Token invalid or expired.' });
  }
};

/**
 * Authorize by permission string, e.g. "GROUP:READ" or "OBJECT:CREATE".
 * Permissions are resolved from the user's groups (roleId + membership).
 */
const authorize = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authorization required.' });
      }

      if (!permission || typeof permission !== 'string') {
        return res.status(500).json({ message: 'Authorization is misconfigured.' });
      }

      const allowed = await userHasPermission(req.user, permission);
      if (!allowed) {
        return res.status(403).json({
          message: `Forbidden: Insufficient permissions for ${permission}.`,
          username: req.user.username,
          hint: 'Log in as the seeded admin user (npm run db:init) or grant this permission to one of your groups.',
        });
      }

      next();
    } catch (error) {
      console.error('Authorization Error:', error.message);
      return res.status(403).json({
        message: `Forbidden: Insufficient permissions for ${permission}.`,
      });
    }
  };
};

/**
 * Attach effective permissions for the current user (used by /api/auth/me).
 */
const attachPermissions = async (req, res, next) => {
  try {
    req.permissions = await listUserPermissions(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { protect, authorize, attachPermissions };
