const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} = require('../controllers/userController');
const { adminChangeUserPassword } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { createUserBody, adminPasswordBody, paramObjectId } = require('../validation/schemas');

router.use(protect);

router.get('/', authorize('USER:READ', { allowAnyInstance: true }), getAllUsers);
router.post(
  '/',
  authorize('USER:CREATE', { classWideOnly: true }),
  validate(createUserBody),
  createUser
);
router.post(
  '/:id/password',
  authorize('USER:WRITE', { param: 'id' }),
  validate(adminPasswordBody),
  adminChangeUserPassword
);
router.get(
  '/:id',
  validate(paramObjectId('id', 'User id')),
  authorize('USER:READ', { param: 'id' }),
  getUserById
);
router.put(
  '/:id',
  validate(paramObjectId('id', 'User id')),
  authorize('USER:WRITE', { param: 'id' }),
  updateUser
);
router.delete(
  '/:id',
  validate(paramObjectId('id', 'User id')),
  authorize('USER:DELETE', { param: 'id' }),
  deleteUser
);

module.exports = router;
