const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', authorize('USER:READ'), getAllUsers);
router.post('/', authorize('USER:CREATE'), createUser);
router.get('/:id', authorize('USER:READ'), getUserById);
router.put('/:id', authorize('USER:WRITE'), updateUser);
router.delete('/:id', authorize('USER:DELETE'), deleteUser);

module.exports = router;
