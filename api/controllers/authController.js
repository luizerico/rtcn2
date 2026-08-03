const User = require('../models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  createSession,
  revokeSession,
  revokeAllUserSessions,
  listActiveSessions,
  listUserSessions,
} = require('../services/sessionService');
const { userHasPermission } = require('../services/rbacService');
const { assertPasswordPolicy } = require('../utils/passwordPolicy');

const mockSendEmail = async (email, subject) => {
  console.log(`[MOCK EMAIL SENT] To: ${email} | Subject: ${subject}`);
  return true;
};

function requestMeta(req) {
  return {
    userAgent: req.get('user-agent') || '',
    ipAddress: req.ip || req.socket?.remoteAddress || '',
    clientApp: req.get('x-client-app') || 'rbac-platform',
  };
}

exports.registerUser = async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Please include all fields.' });
  }

  const passwordCheck = assertPasswordPolicy(password);
  if (!passwordCheck.ok) {
    return res.status(400).json({ message: passwordCheck.message });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User or Email already registered.' });
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
      message: 'User registered successfully.',
      user: { id: newUser._id, username: newUser.username, email: newUser.email },
    });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

exports.loginUser = async (req, res) => {
  const { username, email, password } = req.body;
  const loginId = username || email;

  if (!loginId || !password) {
    return res.status(400).json({ message: 'Please provide username and password.' });
  }

  try {
    const user = await User.findOne({
      $or: [{ username: loginId }, { email: loginId }],
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      if (user) {
        req.actionLogContext = { userId: user._id, username: user.username };
      }
      return res.status(401).json({
        message: 'Invalid credentials.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const { token, session } = await createSession({
      user,
      ...requestMeta(req),
    });

    req.actionLogContext = { userId: user._id, username: user.username };

    res.status(200).json({
      message: 'Login successful.',
      token,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

exports.logoutUser = async (req, res) => {
  try {
    if (req.session?.sessionId) {
      await revokeSession(req.session.sessionId, 'logout');
    }
    res.status(200).json({ message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error during logout.' });
  }
};

exports.requestPasswordReset = async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const resetToken = crypto.randomUUID();
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 3);

    user.resetToken = resetToken;
    user.tokenExpiry = expirationDate;
    await user.save();

    const message = `Use this secure link to reset your password: ${process.env.CLIENT_URL || 'http://localhost:3000'}/reset/${resetToken}`;
    await mockSendEmail(user.email, 'Password Reset Request', message);

    res.status(200).json({
      message: 'Password reset link sent successfully to your email.',
      ...(process.env.NODE_ENV !== 'production' ? { resetToken } : {}),
    });
  } catch (err) {
    console.error('Password Reset Error:', err);
    res.status(500).json({ message: 'Error requesting password reset.' });
  }
};

exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  const passwordCheck = assertPasswordPolicy(newPassword);
  if (!passwordCheck.ok) {
    return res.status(400).json({
      message: passwordCheck.message === 'Password is required.'
        ? 'New password is required.'
        : passwordCheck.message,
    });
  }

  try {
    const user = await User.findOne({ resetToken: token }).select(
      'password email resetToken tokenExpiry'
    );

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired password reset token.' });
    }

    if (user.tokenExpiry < new Date()) {
      await User.findByIdAndUpdate(user._id, {
        $set: { resetToken: null, tokenExpiry: null },
      });
      return res.status(400).json({ message: 'Password reset link has expired.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(passwordCheck.password, salt);
    user.resetToken = null;
    user.tokenExpiry = null;
    await user.save();
    await revokeAllUserSessions(user._id, 'password_reset');

    res.status(200).json({ message: 'Password reset successful.' });
  } catch (err) {
    console.error('Password Reset Error:', err);
    res.status(500).json({ message: 'Server error during password reset.' });
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
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required.' });
  }
  const passwordCheck = assertPasswordPolicy(newPassword);
  if (!passwordCheck.ok) {
    return res.status(400).json({
      message: passwordCheck.message === 'Password is required.'
        ? 'Current password and new password are required.'
        : passwordCheck.message,
    });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    user.password = await bcrypt.hash(passwordCheck.password, 10);
    await user.save();
    await revokeAllUserSessions(user._id, 'password_changed');

    res.status(200).json({
      message: 'Password updated. Please sign in again with your new password.',
      code: 'PASSWORD_CHANGED',
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error updating password.' });
  }
};

/**
 * Admin password update for another user.
 */
exports.adminChangeUserPassword = async (req, res) => {
  const { newPassword } = req.body;
  const { id } = req.params;

  const passwordCheck = assertPasswordPolicy(newPassword);
  if (!passwordCheck.ok) {
    return res.status(400).json({ message: passwordCheck.message });
  }

  try {
    const canManage = await userHasPermission(req.user, 'USER:WRITE');
    if (!canManage) {
      return res.status(403).json({
        message: 'Forbidden: Insufficient permissions for USER:WRITE.',
        code: 'FORBIDDEN',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    user.password = await bcrypt.hash(passwordCheck.password, 10);
    await user.save();
    await revokeAllUserSessions(user._id, 'admin_password_reset');

    res.status(200).json({
      message: `Password updated for ${user.username}. Their active sessions were disconnected.`,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error updating user password.' });
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
    res.status(500).json({ message: 'Error listing sessions.' });
  }
};

exports.disconnectSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const Session = require('../models/Session');
    const session = await Session.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    const isOwn = String(session.userId) === String(req.user._id);
    const canManage = await userHasPermission(req.user, 'USER:WRITE');

    if (!isOwn && !canManage) {
      return res.status(403).json({
        message: 'Forbidden: you can only disconnect your own sessions.',
        code: 'FORBIDDEN',
      });
    }

    await revokeSession(sessionId, isOwn ? 'user_disconnect' : 'admin_disconnect');

    res.status(200).json({
      message: 'Session disconnected.',
      sessionId,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error disconnecting session.' });
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
