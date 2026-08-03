const express = require('express');
const router = express.Router();
const { listActionLogs, getActionLogFilters } = require('../controllers/actionLogController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { actionLogQuery } = require('../validation/schemas');

router.use(protect);

router.get('/filters', authorize('LOG:READ'), getActionLogFilters);
router.get('/', authorize('LOG:READ'), validate(actionLogQuery), listActionLogs);

module.exports = router;
