const User = require('../models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');
const { assertPasswordPolicy } = require('../utils/passwordPolicy');
const {
  createResetToken,
  createVerificationToken,
  hashResetToken,
} = require('../utils/passwordReset');
const {
  createSession,
  revokeSession,
  revokeAllUserSessions,
  querySessions,
} = require('../services/sessionService');
const { userHasPermission } = require('../services/rbacService');
const { sendEmail } = require('../services/emailService');
const {
  setSessionCookie,
  clearSessionCookie,
  parseCookieHeader,
  isSecureRequest,
} = require('../utils/sessionCookie');
const { attachUserGroups, USER_PUBLIC_EXCLUDE } = require('../utils/userPresentation');
const {
  googleConfigured,
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleProfile,
  uniqueUsernameFromEmail,
} = require('../services/googleAuth');

const GOOGLE_STATE_COOKIE = 'oauth_google_state';

function setGoogleStateCookie(req, res, state) {
  const parts = [
    `${GOOGLE_STATE_COOKIE}=${encodeURIComponent(state)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${10 * 60}`,
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearGoogleStateCookie(req, res) {
  const parts = [
    `${GOOGLE_STATE_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function requestMeta(req) {
  return {
    userAgent: req.get('user-agent') || '',
    ipAddress: req.ip || req.socket?.remoteAddress || '',
    clientApp: req.get('x-client-app') || 'rbac-platform',
  };
}

function clientBaseUrl() {
  return (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function sendVerificationEmail(user, rawToken) {
  const verifyUrl = `${clientBaseUrl()}/verify/${rawToken}`;
  const text = `Verify your account by opening this link: ${verifyUrl}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your account',
    text,
  });
}

async function issueSessionResponse(req, res, user, message = 'Login successful.') {
  user.lastLoginAt = new Date();
  await user.save();

  const { token, session } = await createSession({
    user,
    ...requestMeta(req),
  });

  req.actionLogContext = { userId: user._id, username: user.username };
  setSessionCookie(req, res, token, session.expiresAt);

  res.status(200).json({
    message,
    token,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      isVerified: user.isVerified,
      lastLoginAt: user.lastLoginAt,
    },
  });
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
    const { raw, hash, expiresAt } = createVerificationToken();

    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      isVerified: false,
      verificationTokenHash: hash,
      verificationTokenExpiry: expiresAt,
    });

    try {
      await sendVerificationEmail(newUser, raw);
    } catch (mailErr) {
      console.error('Verification email failed:', mailErr.message);
    }

    req.actionLogContext = { userId: newUser._id, username: newUser.username };

    res.status(201).json({
      message:
        'User registered successfully. Check your email to verify the account before sign-in, or ask an administrator to verify you.',
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

exports.verifyEmail = async (req, res) => {
  const token = req.params.token || req.validated?.token;
  if (!token) {
    return sendError(res, 400, 'Verification token is required.', ERROR_CODES.VALIDATION);
  }

  try {
    const tokenHash = hashResetToken(token);
    const user = await User.findOne({ verificationTokenHash: tokenHash });

    if (!user) {
      return sendError(res, 400, 'Invalid or expired verification link.', ERROR_CODES.VALIDATION);
    }

    if (!user.verificationTokenExpiry || user.verificationTokenExpiry < new Date()) {
      await User.findByIdAndUpdate(user._id, {
        $set: { verificationTokenHash: null, verificationTokenExpiry: null },
      });
      return sendError(res, 400, 'Verification link has expired.', ERROR_CODES.VALIDATION);
    }

    user.isVerified = true;
    user.verificationTokenHash = null;
    user.verificationTokenExpiry = null;
    await user.save();

    res.status(200).json({
      message: 'Email verified. You can sign in now.',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isVerified: true,
      },
    });
  } catch (err) {
    return sendServerError(res, err, 'Server error during email verification.');
  }
};

exports.loginUser = async (req, res) => {
  const loginId = req.validated?.loginId || req.body.username || req.body.email;
  const password = req.validated?.password || req.body.password;

  try {
    const user = await User.findOne({
      $or: [{ username: loginId }, { email: loginId }],
    });

    const passwordOk =
      user &&
      typeof user.password === 'string' &&
      user.password.length > 0 &&
      (await bcrypt.compare(password, user.password));

    if (!user || !passwordOk) {
      if (user) {
        req.actionLogContext = { userId: user._id, username: user.username };
      }
      return sendError(res, 401, 'Invalid credentials.', { code: 'INVALID_CREDENTIALS' });
    }

    if (!user.isVerified) {
      req.actionLogContext = { userId: user._id, username: user.username };
      return res.status(403).json({
        message:
          'Account is not verified. Check your email for a verification link, or ask an administrator to verify your account.',
        code: 'NOT_VERIFIED',
      });
    }

    return issueSessionResponse(req, res, user);
  } catch (err) {
    return sendServerError(res, err, 'Server error during login.');
  }
};

exports.startGoogleAuth = async (req, res) => {
  if (!googleConfigured()) {
    return sendError(
      res,
      503,
      'Google sign-in is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI (or CLIENT_URL).',
      { code: 'GOOGLE_NOT_CONFIGURED' }
    );
  }

  const state = crypto.randomBytes(16).toString('hex');
  setGoogleStateCookie(req, res, state);
  res.redirect(buildGoogleAuthUrl(state));
};

exports.googleAuthCallback = async (req, res) => {
  const clientUrl = clientBaseUrl();

  if (!googleConfigured()) {
    return res.redirect(`${clientUrl}/login?reason=GOOGLE_NOT_CONFIGURED`);
  }

  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(`${clientUrl}/login?reason=GOOGLE_DENIED`);
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  const expectedState = cookies[GOOGLE_STATE_COOKIE];
  clearGoogleStateCookie(req, res);
  if (!code || !state || !expectedState || state !== expectedState) {
    return res.redirect(`${clientUrl}/login?reason=GOOGLE_STATE`);
  }

  try {
    const tokens = await exchangeCodeForTokens(String(code));
    const profile = await fetchGoogleProfile(tokens.access_token);

    let user = await User.findOne({
      $or: [{ googleId: profile.sub }, { email: profile.email }],
    });

    if (user) {
      if (!user.googleId) {
        user.googleId = profile.sub;
      }
      // Google-verified email unlocks the account.
      if (profile.email_verified !== false) {
        user.isVerified = true;
        user.verificationTokenHash = null;
        user.verificationTokenExpiry = null;
      }
      await user.save();
    } else {
      const username = await uniqueUsernameFromEmail(User, profile.email);
      user = await User.create({
        username,
        email: profile.email,
        googleId: profile.sub,
        isVerified: profile.email_verified !== false,
        password: undefined,
      });
    }

    if (!user.isVerified) {
      return res.redirect(`${clientUrl}/login?reason=NOT_VERIFIED`);
    }

    user.lastLoginAt = new Date();
    await user.save();

    const { token, session } = await createSession({
      user,
      ...requestMeta(req),
    });
    setSessionCookie(req, res, token, session.expiresAt);

    return res.redirect(`${clientUrl}/?nav=minimized`);
  } catch (err) {
    console.error('Google OAuth callback error:', err.message);
    return res.redirect(`${clientUrl}/login?reason=GOOGLE_FAILED`);
  }
};

exports.googleAuthStatus = async (_req, res) => {
  res.status(200).json({ enabled: googleConfigured() });
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

      const resetUrl = `${clientBaseUrl()}/reset/${raw}`;
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
  try {
    const fresh = await User.findById(req.user._id).select(USER_PUBLIC_EXCLUDE);
    const withGroups = await attachUserGroups(fresh || req.user);

    res.status(200).json({
      user: {
        id: withGroups._id,
        username: withGroups.username,
        email: withGroups.email,
        roleId: withGroups.roleId,
        isVerified: withGroups.isVerified,
        lastLoginAt: withGroups.lastLoginAt || null,
        googleId: withGroups.googleId || null,
        groups: withGroups.groups || [],
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
  } catch (err) {
    return sendServerError(res, err, 'Error loading current user.');
  }
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
    if (
      !user ||
      !user.password ||
      !(await bcrypt.compare(currentPassword, user.password))
    ) {
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
    const scopeUserId = canManage ? null : req.user._id;
    const result = await querySessions(req.query, { userId: scopeUserId });

    res.status(200).json({
      ...result,
      sessions: result.items,
      scope: canManage ? 'all' : 'self',
    });
  } catch (err) {
    if (err?.name === 'ValidationError' || err?.status === 400) {
      return sendError(res, 400, err.message, ERROR_CODES.VALIDATION);
    }
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
