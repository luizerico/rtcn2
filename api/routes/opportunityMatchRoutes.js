const express = require('express');
const router = express.Router();
const {
  createMatchRun,
  getMatchRunById,
  cancelMatchRunById,
  listMatchRuns,
} = require('../controllers/opportunityMatchController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { paramObjectId } = require('../validation/schemas');

router.use(protect);

router.get(
  '/',
  authorize('OPPORTUNITY:READ', { allowAnyInstance: true }),
  listMatchRuns
);
router.post(
  '/',
  authorize('OPPORTUNITY:WRITE', { allowAnyInstance: true }),
  createMatchRun
);
router.get(
  '/:runId',
  validate(paramObjectId('runId', 'Run id')),
  authorize('OPPORTUNITY:READ', { allowAnyInstance: true }),
  getMatchRunById
);
router.post(
  '/:runId/cancel',
  validate(paramObjectId('runId', 'Run id')),
  authorize('OPPORTUNITY:WRITE', { allowAnyInstance: true }),
  cancelMatchRunById
);

module.exports = router;
