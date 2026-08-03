const express = require('express');
const router = express.Router();
const { listActionLogs, getActionLogFilters } = require('../controllers/actionLogController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/filters', authorize('LOG:READ'), getActionLogFilters);
router.get('/', authorize('LOG:READ'), listActionLogs);

module.exports = router;
