const express = require('express');
const router = express.Router();
const {
  listLocalPlans,
  previewLocalPlan,
  createLocalPlan,
  getLocalPlan,
  updateLocalPlan,
  setDefaultLocalPlan,
  deleteLocalPlan,
  listLocalPlanChanges,
} = require('../controllers/localPlanController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { paramObjectId } = require('../validation/schemas');

router.use(protect);

router.get(
  '/',
  authorize('LOCALPLAN:READ', { allowAnyInstance: true }),
  listLocalPlans
);
router.get(
  '/preview',
  authorize('LOCALPLAN:CREATE', { classWideOnly: true }),
  previewLocalPlan
);
router.post('/', authorize('LOCALPLAN:CREATE', { classWideOnly: true }), createLocalPlan);
router.get(
  '/:id/changes',
  validate(paramObjectId('id', 'Local plan id')),
  authorize('LOCALPLAN:READ', { param: 'id' }),
  listLocalPlanChanges
);
router.post(
  '/:id/default',
  validate(paramObjectId('id', 'Local plan id')),
  authorize('LOCALPLAN:WRITE', { param: 'id' }),
  setDefaultLocalPlan
);
router.get(
  '/:id',
  validate(paramObjectId('id', 'Local plan id')),
  authorize('LOCALPLAN:READ', { param: 'id' }),
  getLocalPlan
);
router.put(
  '/:id',
  validate(paramObjectId('id', 'Local plan id')),
  authorize('LOCALPLAN:WRITE', { param: 'id' }),
  updateLocalPlan
);
router.delete(
  '/:id',
  validate(paramObjectId('id', 'Local plan id')),
  authorize('LOCALPLAN:DELETE', { param: 'id' }),
  deleteLocalPlan
);

module.exports = router;
