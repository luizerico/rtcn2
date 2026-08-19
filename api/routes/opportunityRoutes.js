const express = require('express');
const router = express.Router();
const {
  listOpportunities,
  createOpportunity,
  getOpportunityById,
  updateOpportunity,
  deleteOpportunity,
} = require('../controllers/opportunityController');
const {
  startOpportunityFileAnalysis,
  getOpportunityFileAnalysis,
} = require('../controllers/opportunityAnalysisController');
const { createOwnerFileHandlers } = require('../controllers/storedFileController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { paramObjectId } = require('../validation/schemas');
const upload = require('../middleware/upload');

const opportunityFiles = createOwnerFileHandlers('opportunity');

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

router.get(
  '/:id/files',
  validate(paramObjectId('id', 'Opportunity id')),
  authorize('OPPORTUNITY:READ', { param: 'id' }),
  opportunityFiles.list
);
router.post(
  '/:id/files',
  validate(paramObjectId('id', 'Opportunity id')),
  authorize('OPPORTUNITY:WRITE', { param: 'id' }),
  upload.array('file'),
  opportunityFiles.upload
);
router.post(
  '/:id/files/:fileId/analyses',
  validate(paramObjectId('id', 'Opportunity id')),
  validate(paramObjectId('fileId', 'File id')),
  authorize('OPPORTUNITY:WRITE', { param: 'id' }),
  startOpportunityFileAnalysis
);
router.get(
  '/:id/files/:fileId/analyses/:jobId',
  validate(paramObjectId('id', 'Opportunity id')),
  validate(paramObjectId('fileId', 'File id')),
  authorize('OPPORTUNITY:READ', { param: 'id' }),
  getOpportunityFileAnalysis
);

module.exports = router;
