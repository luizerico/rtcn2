const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, attachPermissions } = require('../middleware/authMiddleware');

router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
router.get('/forgot-password', authController.requestPasswordReset);
router.post('/reset-password/:token', authController.resetPassword);

router.post('/logout', protect, authController.logoutUser);
router.get('/me', protect, attachPermissions, authController.getCurrentUser);
router.get('/validate', protect, authController.validateSession);
router.post('/change-password', protect, authController.changeOwnPassword);

router.get('/sessions', protect, authController.listSessions);
router.delete('/sessions/:sessionId', protect, authController.disconnectSession);

module.exports = router;
