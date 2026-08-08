const express = require('express');
const router = express.Router();
const {
  listSurveys,
  createSurvey,
  getSurveyById,
  updateSurvey,
  deleteSurvey,
  submitSurveyResponse,
  listSurveyResponses,
} = require('../controllers/surveyController');
const { protect, authorize, requireAdmin } = require('../middleware/authMiddleware');

router.use(protect);

router.get(
  '/',
  authorize('SURVEY:READ', { allowAnyInstance: true, attachAccessible: true }),
  listSurveys
);
router.post('/', authorize('SURVEY:CREATE', { classWideOnly: true }), createSurvey);
router.get('/:id', authorize('SURVEY:READ', { param: 'id' }), getSurveyById);
router.put('/:id', authorize('SURVEY:WRITE', { param: 'id' }), updateSurvey);
router.delete('/:id', authorize('SURVEY:DELETE', { param: 'id' }), deleteSurvey);

/** Results: admin group only. */
router.get('/:id/responses', requireAdmin, listSurveyResponses);
/** Answering: anyone who can read the survey. */
router.post(
  '/:id/responses',
  authorize('SURVEY:READ', { param: 'id' }),
  submitSurveyResponse
);

module.exports = router;
