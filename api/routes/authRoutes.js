const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, attachPermissions } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const {
  registerBody,
  loginBody,
  changePasswordBody,
  resetPasswordBody,
  forgotPasswordQuery,
} = require('../validation/schemas');

router.post('/register', validate(registerBody), authController.registerUser);
router.post('/login', validate(loginBody), authController.loginUser);
router.get('/forgot-password', validate(forgotPasswordQuery), authController.requestPasswordReset);
router.post(
  '/reset-password/:token',
  validate(resetPasswordBody),
  authController.resetPassword
);

router.post('/logout', protect, authController.logoutUser);
router.get('/me', protect, attachPermissions, authController.getCurrentUser);
router.get('/validate', protect, authController.validateSession);
router.post(
  '/change-password',
  protect,
  validate(changePasswordBody),
  authController.changeOwnPassword
);

router.get('/sessions', protect, authController.listSessions);
router.delete('/sessions/:sessionId', protect, authController.disconnectSession);

module.exports = router;
