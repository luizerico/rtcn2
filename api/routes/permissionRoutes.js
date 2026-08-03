const express = require('express');
const router = express.Router();
const {
  listPermissions,
  getPermissionCatalog,
  getAssetAcl,
  applyAssetAcl,
} = require('../controllers/permissionController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', authorize('GROUP:READ', { allowAnyInstance: true }), listPermissions);
router.get('/catalog', authorize('GROUP:READ', { allowAnyInstance: true }), getPermissionCatalog);
router.get('/acl', authorize('GROUP:READ', { allowAnyInstance: true }), getAssetAcl);
router.post('/acl', authorize('GROUP:WRITE', { allowAnyInstance: true }), applyAssetAcl);

module.exports = router;
