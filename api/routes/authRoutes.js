const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, attachPermissions } = require('../middleware/authMiddleware');

router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
router.get('/forgot-password', authController.requestPasswordReset);
router.post('/reset-password/:token', authController.resetPassword);
router.get('/me', protect, attachPermissions, authController.getCurrentUser);

module.exports = router;
