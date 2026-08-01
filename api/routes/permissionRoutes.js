const express = require('express');
const router = express.Router();
const {
  listPermissions,
  getPermissionCatalog,
} = require('../controllers/permissionController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', authorize('GROUP:READ', { allowAnyInstance: true }), listPermissions);
router.get('/catalog', authorize('GROUP:READ', { allowAnyInstance: true }), getPermissionCatalog);

module.exports = router;
