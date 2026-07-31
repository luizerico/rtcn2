const express = require('express');
const router = express.Router();
const { listPermissions } = require('../controllers/permissionController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', authorize('GROUP:READ'), listPermissions);

module.exports = router;
