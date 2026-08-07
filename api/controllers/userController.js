const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { assertPasswordPolicy } = require('../utils/passwordPolicy');

exports.getAllUsers = async (_req, res) => {
  try {
    const users = await User.find({}).select('-password -resetToken -tokenExpiry').sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching users');
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -resetToken -tokenExpiry');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.status(200).json(user);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching user');
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, email, password } = req.validated || req.body;

    const passwordCheck = assertPasswordPolicy(password);
    if (!passwordCheck.ok) {
      return res.status(400).json({ message: passwordCheck.message });
    }

    const passwordPolicy = assertPasswordPolicy(password);
    if (!passwordPolicy.ok) {
      return res.status(400).json({ message: passwordPolicy.message });
    }

    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      return res.status(400).json({ message: 'User or email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    // Admin-provisioned accounts are trusted and can sign in immediately.
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      isVerified: true,
    });

    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      roleId: user.roleId,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    });
  } catch (error) {
    return sendServerError(res, error, 'Error creating user');
  }
};

/** Intentional admin-writable fields only (no password/roleId/reset tokens). */
const USER_UPDATE_ALLOWED = ['username', 'email', 'isVerified'];

exports.updateUser = async (req, res) => {
  try {
    const updates = {};
    for (const key of USER_UPDATE_ALLOWED) {
      if (!Object.prototype.hasOwnProperty.call(req.body, key)) continue;
      if (key === 'isVerified') {
        if (typeof req.body.isVerified !== 'boolean') {
          return res.status(400).json({ message: 'isVerified must be a boolean.' });
        }
        updates.isVerified = req.body.isVerified;
        continue;
      }
      updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: `No updatable fields provided. Allowed: ${USER_UPDATE_ALLOWED.join(', ')}.`,
      });
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    }).select('-password -resetToken -tokenExpiry');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json(user);
  } catch (error) {
    return sendServerError(res, error, 'Error updating user');
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.status(200).json({ message: 'User deleted successfully.' });
  } catch (error) {
    return sendServerError(res, error, 'Error deleting user');
  }
};
