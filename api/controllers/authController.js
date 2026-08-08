const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');
const { assertPasswordPolicy } = require('../utils/passwordPolicy');
const { createResetToken, hashResetToken } = require('../utils/passwordReset');
const {
  createSession,
  revokeSession,
  revokeAllUserSessions,
  listActiveSessions,
  listUserSessions,
} = require('../services/sessionService');
const { userHasPermission } = require('../services/rbacService');
const { sendEmail } = require('../services/emailService');
const { setSessionCookie, clearSessionCookie } = require('../utils/sessionCookie');


function requestMeta(req) {
  return {
    userAgent: req.get('user-agent') || '',
    ipAddress: req.ip || req.socket?.remoteAddress || '',
    clientApp: req.get('x-client-app') || 'rbac-platform',
  };
}

exports.registerUser = async (req, res) => {
  const { username, email, password } = req.validated || req.body;

  const passwordCheck = assertPasswordPolicy(password);
  if (!passwordCheck.ok) {
    return sendError(res, 400, passwordCheck.message, ERROR_CODES.VALIDATION);
  }

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return sendError(res, 400, 'User or Email already registered.', ERROR_CODES.CONFLICT);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(passwordCheck.password, salt);

    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    req.actionLogContext = { userId: newUser._id, username: newUser.username };

    res.status(201).json({
      message:
        'User registered successfully. An administrator must verify the account before sign-in.',
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        isVerified: newUser.isVerified,
      },
    });
  } catch (err) {
    return sendServerError(res, err, 'Server error during registration.');
  }
};

exports.loginUser = async (req, res) => {
  const loginId = req.validated?.loginId || req.body.username || req.body.email;
  const password = req.validated?.password || req.body.password;

  try {
    const user = await User.findOne({
      $or: [{ username: loginId }, { email: loginId }],
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      if (user) {
        req.actionLogContext = { userId: user._id, username: user.username };
      }
      return sendError(res, 401, 'Invalid credentials.', { code: 'INVALID_CREDENTIALS' });
    }

    if (!user.isVerified) {
      req.actionLogContext = { userId: user._id, username: user.username };
      return res.status(403).json({
        message:
          'Account is not verified. An administrator must set isVerified before you can sign in.',
        code: 'NOT_VERIFIED',
      });
    }

    const { token, session } = await createSession({
      user,
      ...requestMeta(req),
    });

    req.actionLogContext = { userId: user._id, username: user.username };
    setSessionCookie(req, res, token, session.expiresAt);

    res.status(200).json({
      message: 'Login successful.',
      // Token remains available for API clients (Postman, reports tooling).
      // Browsers should prefer the httpOnly session cookie.
      token,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    return sendServerError(res, err, 'Server error during login.');
  }
};

exports.logoutUser = async (req, res) => {
  try {
    if (req.session?.sessionId) {
      await revokeSession(req.session.sessionId, 'logout');
    }
    clearSessionCookie(req, res);
    res.status(200).json({ message: 'Logged out successfully.' });
  } catch (err) {
    return sendServerError(res, err, 'Server error during logout.');
  }
};

const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for that email, a password reset link has been sent.';

exports.requestPasswordReset = async (req, res) => {
  const email = req.validated?.email || req.query.email;

  try {
    const user = await User.findOne({ email });
    if (user) {
      const { raw, hash, expiresAt } = createResetToken();
      user.resetTokenHash = hash;
      user.tokenExpiry = expiresAt;
      await user.save();

      const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset/${raw}`;
      const text = `Use this secure link to reset your password: ${resetUrl}`;
      await sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        text,
      });
    }

    // Always the same response to avoid email enumeration.
    res.status(200).json({ message: FORGOT_PASSWORD_MESSAGE });
  } catch (err) {
    return sendServerError(res, err, 'Error requesting password reset.');
  }
};

exports.resetPassword = async (req, res) => {
  const token = req.validated?.token || req.params.token;
  const newPassword = req.validated?.newPassword || req.body.newPassword;

  const passwordCheck = assertPasswordPolicy(newPassword);
  if (!passwordCheck.ok) {
    return sendError(res, 400, passwordCheck.message, ERROR_CODES.VALIDATION);
  }

  try {
    const tokenHash = hashResetToken(token);
    const user = await User.findOne({ resetTokenHash: tokenHash }).select(
      'password email resetTokenHash tokenExpiry'
    );

    if (!user) {
      return sendError(res, 400, 'Invalid or expired password reset token.', ERROR_CODES.VALIDATION);
    }

    if (!user.tokenExpiry || user.tokenExpiry < new Date()) {
      await User.findByIdAndUpdate(user._id, {
        $set: { resetTokenHash: null, tokenExpiry: null },
      });
      return sendError(res, 400, 'Password reset link has expired.', ERROR_CODES.VALIDATION);
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(passwordCheck.password, salt);
    user.resetTokenHash = null;
    user.tokenExpiry = null;
    await user.save();
    await revokeAllUserSessions(user._id, 'password_reset');

    res.status(200).json({ message: 'Password reset successful.' });
  } catch (err) {
    return sendServerError(res, err, 'Server error during password reset.');
  }
};

exports.getCurrentUser = async (req, res) => {
  res.status(200).json({
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      roleId: req.user.roleId,
      isVerified: req.user.isVerified,
    },
    session: req.session
      ? {
          sessionId: req.session.sessionId,
          expiresAt: req.session.expiresAt,
          lastSeenAt: req.session.lastSeenAt,
          clientApp: req.session.clientApp,
        }
      : null,
    permissions: req.permissions || [],
    isAdmin: Boolean(req.isAdmin),
  });
};

/**
 * Change password for the authenticated user.
 */
exports.changeOwnPassword = async (req, res) => {
  const currentPassword = req.validated?.currentPassword || req.body.currentPassword;
  const newPassword = req.validated?.newPassword || req.body.newPassword;

  const passwordCheck = assertPasswordPolicy(newPassword);
  if (!passwordCheck.ok) {
    return sendError(res, 400, passwordCheck.message, ERROR_CODES.VALIDATION);
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return sendError(res, 400, 'Current password is incorrect.', ERROR_CODES.VALIDATION);
    }

    user.password = await bcrypt.hash(passwordCheck.password, 10);
    await user.save();
    await revokeAllUserSessions(user._id, 'password_changed');
    clearSessionCookie(req, res);

    res.status(200).json({
      message: 'Password updated. Please sign in again with your new password.',
      code: 'PASSWORD_CHANGED',
    });
  } catch (err) {
    return sendServerError(res, err, 'Server error updating password.');
  }
};

/**
 * Admin password update for another user.
 */
exports.adminChangeUserPassword = async (req, res) => {
  const newPassword = req.validated?.newPassword || req.body.newPassword;
  const id = req.validated?.id || req.params.id;

  const passwordCheck = assertPasswordPolicy(newPassword);
  if (!passwordCheck.ok) {
    return sendError(res, 400, passwordCheck.message, ERROR_CODES.VALIDATION);
  }

  try {
    const canManage = await userHasPermission(req.user, 'USER:WRITE');
    if (!canManage) {
      return sendError(res, 403, 'Forbidden: Insufficient permissions for USER:WRITE.', {
        code: 'FORBIDDEN',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND);
    }

    user.password = await bcrypt.hash(passwordCheck.password, 10);
    await user.save();
    await revokeAllUserSessions(user._id, 'admin_password_reset');

    res.status(200).json({
      message: `Password updated for ${user.username}. Their active sessions were disconnected.`,
    });
  } catch (err) {
    return sendServerError(res, err, 'Server error updating user password.');
  }
};

exports.listSessions = async (req, res) => {
  try {
    const canManage = await userHasPermission(req.user, 'USER:READ');
    const sessions = canManage
      ? await listActiveSessions()
      : await listUserSessions(req.user._id);

    res.status(200).json({
      sessions,
      scope: canManage ? 'all' : 'self',
    });
  } catch (err) {
    return sendServerError(res, err, 'Error listing sessions.');
  }
};

exports.disconnectSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const Session = require('../models/Session');
    const session = await Session.findOne({ sessionId });

    if (!session) {
      return sendError(res, 404, 'Session not found.', ERROR_CODES.NOT_FOUND);
    }

    const isOwn = String(session.userId) === String(req.user._id);
    const canManage = await userHasPermission(req.user, 'USER:WRITE');

    if (!isOwn && !canManage) {
      return sendError(res, 403, 'Forbidden: you can only disconnect your own sessions.', {
        code: 'FORBIDDEN',
      });
    }

    await revokeSession(sessionId, isOwn ? 'user_disconnect' : 'admin_disconnect');

    res.status(200).json({
      message: 'Session disconnected.',
      sessionId,
    });
  } catch (err) {
    return sendServerError(res, err, 'Error disconnecting session.');
  }
};

/**
 * Validate a bearer session for shared authentication with other apps.
 */
exports.validateSession = async (req, res) => {
  res.status(200).json({
    valid: true,
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
    },
    session: {
      sessionId: req.session.sessionId,
      expiresAt: req.session.expiresAt,
      clientApp: req.session.clientApp,
    },
  });
};

