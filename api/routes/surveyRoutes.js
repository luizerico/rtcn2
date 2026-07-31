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
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', authorize('ASSET:READ'), listSurveys);
router.post('/', authorize('ASSET:CREATE'), createSurvey);
router.get('/:id', authorize('ASSET:READ'), getSurveyById);
router.put('/:id', authorize('ASSET:WRITE'), updateSurvey);
router.delete('/:id', authorize('ASSET:DELETE'), deleteSurvey);

router.get('/:id/responses', authorize('ASSET:READ'), listSurveyResponses);
router.post('/:id/responses', authorize('ASSET:CREATE'), submitSurveyResponse);

module.exports = router;
