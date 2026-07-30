const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const mockSendEmail = async (email, subject) => {
  console.log(`[MOCK EMAIL SENT] To: ${email} | Subject: ${subject}`);
  return true;
};

/**
 * @desc    Registers a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.registerUser = async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Please include all fields.' });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User or Email already registered.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    res.status(201).json({
      message: 'User registered successfully.',
      user: { id: newUser._id, username: newUser.username, email: newUser.email },
    });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

/**
 * @desc    Authenticates user and sets up JWT
 * @route   POST /api/auth/login
 * @access  Public
 */
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
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: 'Server authentication is misconfigured.' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      secret,
      { expiresIn: process.env.JWT_EXPIRE || '1h' }
    );

    res.status(200).json({
      message: 'Login successful.',
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

/**
 * @desc    Request password reset link/code
 * @route   GET /api/auth/forgot-password
 * @access  Public
 */
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
      // Returned only in non-production to support local testing without email delivery.
      ...(process.env.NODE_ENV !== 'production' ? { resetToken } : {}),
    });
  } catch (err) {
    console.error('Password Reset Error:', err);
    res.status(500).json({ message: 'Error requesting password reset.' });
  }
};

/**
 * @desc    Resets user's password using a token
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 */
exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ message: 'New password is required.' });
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
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetToken = null;
    user.tokenExpiry = null;
    await user.save();

    res.status(200).json({ message: 'Password reset successful.' });
  } catch (err) {
    console.error('Password Reset Error:', err);
    res.status(500).json({ message: 'Server error during password reset.' });
  }
};
