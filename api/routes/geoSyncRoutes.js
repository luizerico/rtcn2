const express = require('express');
const { protect, requireAdmin } = require('../middleware/authMiddleware');
const { getGeoSyncStatus, postGeoSync } = require('../controllers/geoSyncController');
const { listIndicators, listDisasters, listAmendments } = require('../controllers/geoIndicatorController');

const router = express.Router();
router.use(protect);

router.get('/sync/status', requireAdmin, getGeoSyncStatus);
router.post('/sync', requireAdmin, postGeoSync);
router.get('/indicators', listIndicators);
router.get('/disasters', listDisasters);
router.get('/amendments', listAmendments);

module.exports = router;
