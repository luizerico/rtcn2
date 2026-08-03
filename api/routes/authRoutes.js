const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, attachPermissions } = require('../middleware/authMiddleware');
const { authRateLimiter } = require('../middleware/security');

const authLimiter = authRateLimiter();

router.post('/register', authLimiter, authController.registerUser);
router.post('/login', authLimiter, authController.loginUser);
router.get('/forgot-password', authLimiter, authController.requestPasswordReset);
router.post('/reset-password/:token', authLimiter, authController.resetPassword);

router.post('/logout', protect, authController.logoutUser);
router.get('/me', protect, attachPermissions, authController.getCurrentUser);
router.get('/validate', protect, authController.validateSession);
router.post('/change-password', protect, authController.changeOwnPassword);

router.get('/sessions', protect, authController.listSessions);
router.delete('/sessions/:sessionId', protect, authController.disconnectSession);

module.exports = router;
