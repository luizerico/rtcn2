const express = require('express');
const router = express.Router();
const {
  listOpportunities,
  createOpportunity,
  getOpportunityById,
  updateOpportunity,
  deleteOpportunity,
} = require('../controllers/opportunityController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { paramObjectId } = require('../validation/schemas');

router.use(protect);

router.get(
  '/',
  authorize('OPPORTUNITY:READ', { allowAnyInstance: true, attachAccessible: true }),
  listOpportunities
);
router.post('/', authorize('OPPORTUNITY:CREATE', { classWideOnly: true }), createOpportunity);
router.get(
  '/:id',
  validate(paramObjectId('id', 'Opportunity id')),
  authorize('OPPORTUNITY:READ', { param: 'id' }),
  getOpportunityById
);
router.put(
  '/:id',
  validate(paramObjectId('id', 'Opportunity id')),
  authorize('OPPORTUNITY:WRITE', { param: 'id' }),
  updateOpportunity
);
router.delete(
  '/:id',
  validate(paramObjectId('id', 'Opportunity id')),
  authorize('OPPORTUNITY:DELETE', { param: 'id' }),
  deleteOpportunity
);

module.exports = router;
