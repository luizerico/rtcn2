const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { sendServerError, sendError, ERROR_CODES } = require('../utils/httpErrors');

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
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND);
    }
    res.status(200).json(user);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching user');
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return sendError(res, 400, 'Username, email, and password are required.', ERROR_CODES.VALIDATION);
    }

    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      return sendError(res, 400, 'User or email already exists.', ERROR_CODES.CONFLICT);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
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

exports.updateUser = async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.password;
    delete updates.resetToken;
    delete updates.tokenExpiry;

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    }).select('-password -resetToken -tokenExpiry');

    if (!user) {
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND);
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
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND);
    }
    res.status(200).json({ message: 'User deleted successfully.' });
  } catch (error) {
    return sendServerError(res, error, 'Error deleting user');
  }
};
