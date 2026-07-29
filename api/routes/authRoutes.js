const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', authController.registerUser);

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', authController.loginUser);

// @route   GET /api/auth/forgot-password
// @desc    Request password reset link
// @access  Public
router.get('/forgot-password', authController.requestPasswordReset);

// @route   POST /api/auth/reset-password/:token
// @desc    Set user password after verification
// @access  Public
router.post('/reset-password/:token', authController.resetPassword);

module.exports = router;