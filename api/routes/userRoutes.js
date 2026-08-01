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

router.use(protect);

router.get('/', authorize('USER:READ', { allowAnyInstance: true }), getAllUsers);
router.post('/', authorize('USER:CREATE', { classWideOnly: true }), createUser);
router.post('/:id/password', authorize('USER:WRITE', { param: 'id' }), adminChangeUserPassword);
router.get('/:id', authorize('USER:READ', { param: 'id' }), getUserById);
router.put('/:id', authorize('USER:WRITE', { param: 'id' }), updateUser);
router.delete('/:id', authorize('USER:DELETE', { param: 'id' }), deleteUser);

module.exports = router;
