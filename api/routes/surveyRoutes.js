const express = require('express');
const router = express.Router();
const {
  listSurveys,
  createSurvey,
  getSurveyById,
  updateSurvey,
  updateSurveyCounties,
  listSurveyCounties,
  previewSurveyCounties,
  bulkUpdateSurveyCounties,
  deleteSurvey,
  publishSurvey,
  setSurveyActiveVersion,
  setSurveyCountyVersion,
  getSubjectResponse,
  putSubjectResponse,
  listSubjectRevisions,
  submitSurveyResponse,
  listSurveyResponses,
  listAccessibleAnswers,
  listAnswerableCounties,
} = require('../controllers/surveyController');
const { createOwnerFileHandlers } = require('../controllers/storedFileController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { paramObjectId } = require('../validation/schemas');
const upload = require('../middleware/upload');
const { HttpError, sendError, ERROR_CODES } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');
const {
  readSubjectResponse,
  assertCanMutateSubjectResponse,
} = require('../services/surveyInstrumentService');
const Survey = require('../models/assets/Survey');
const { activeFilter } = require('../services/trash');
const mongoose = require('mongoose');

const responseFiles = createOwnerFileHandlers('instrument_response');

async function loadSurveyOr404(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return sendError(res, 400, 'Invalid survey id.', ERROR_CODES.VALIDATION);
  }
  const survey = await Survey.findOne(activeFilter({ _id: req.params.id }));
  if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
  req.survey = survey;
  return next();
}

function authorizeSubjectEdit() {
  return async (req, res, next) => {
    try {
      await assertCanMutateSubjectResponse(
        req.user,
        req.survey,
        req.params.subjectType,
        req.params.subjectId
      );
      return next();
    } catch (error) {
      if (error instanceof HttpError) {
        return sendError(res, error.status, error.message, { code: error.code });
      }
      if (error instanceof ValidationError) {
        return sendError(res, error.statusCode || 400, error.message, ERROR_CODES.VALIDATION);
      }
      return next(error);
    }
  };
}

async function attachResponseOwner(req, res, next) {
  try {
    const payload = await readSubjectResponse(
      req.survey,
      req.params.subjectType,
      req.params.subjectId,
      req.user
    );
    if (!payload._id) {
      return sendError(res, 404, 'Save the response before attaching files.', ERROR_CODES.NOT_FOUND);
    }
    req.params.id = payload._id;
    return next();
  } catch (error) {
    if (error instanceof HttpError) {
      return sendError(res, error.status, error.message, { code: error.code });
    }
    if (error instanceof ValidationError) {
      return sendError(res, error.statusCode || 400, error.message, ERROR_CODES.VALIDATION);
    }
    return next(error);
  }
}

router.use(protect);

router.get('/answers', listAccessibleAnswers);
router.get(
  '/',
  authorize('SURVEY:READ', { allowAnyInstance: true, attachAccessible: true }),
  listSurveys
);
router.post('/', authorize('SURVEY:CREATE', { classWideOnly: true }), createSurvey);
router.post(
  '/:id/publish',
  validate(paramObjectId('id', 'Survey id')),
  authorize('SURVEY:WRITE', { param: 'id' }),
  publishSurvey
);
router.put(
  '/:id/active-version',
  validate(paramObjectId('id', 'Survey id')),
  authorize('SURVEY:WRITE', { param: 'id' }),
  setSurveyActiveVersion
);
router.get(
  '/:id/answerable-counties',
  validate(paramObjectId('id', 'Survey id')),
  authorize('SURVEY:READ', { param: 'id' }),
  listAnswerableCounties
);
router.get(
  '/:id/counties',
  validate(paramObjectId('id', 'Survey id')),
  authorize('SURVEY:READ', { param: 'id' }),
  listSurveyCounties
);
router.put(
  '/:id/counties',
  validate(paramObjectId('id', 'Survey id')),
  authorize('SURVEY:WRITE', { param: 'id' }),
  updateSurveyCounties
);
router.put(
  '/:id/counties/:countyId',
  validate(paramObjectId('id', 'Survey id')),
  validate(paramObjectId('countyId', 'County id')),
  authorize('SURVEY:WRITE', { param: 'id' }),
  setSurveyCountyVersion
);
router.post(
  '/:id/counties/bulk/preview',
  validate(paramObjectId('id', 'Survey id')),
  authorize('SURVEY:READ', { param: 'id' }),
  previewSurveyCounties
);
router.post(
  '/:id/counties/bulk',
  validate(paramObjectId('id', 'Survey id')),
  authorize('SURVEY:WRITE', { param: 'id' }),
  bulkUpdateSurveyCounties
);
router.get(
  '/:id/subjects/:subjectType/:subjectId/revisions',
  validate(paramObjectId('id', 'Survey id')),
  validate(paramObjectId('subjectId', 'Subject id')),
  listSubjectRevisions
);
router.get(
  '/:id/subjects/:subjectType/:subjectId/files',
  validate(paramObjectId('id', 'Survey id')),
  validate(paramObjectId('subjectId', 'Subject id')),
  loadSurveyOr404,
  attachResponseOwner,
  responseFiles.list
);
router.post(
  '/:id/subjects/:subjectType/:subjectId/files',
  validate(paramObjectId('id', 'Survey id')),
  validate(paramObjectId('subjectId', 'Subject id')),
  loadSurveyOr404,
  authorizeSubjectEdit(),
  attachResponseOwner,
  upload.array('file'),
  responseFiles.upload
);
router.get(
  '/:id/subjects/:subjectType/:subjectId',
  validate(paramObjectId('id', 'Survey id')),
  validate(paramObjectId('subjectId', 'Subject id')),
  getSubjectResponse
);
router.put(
  '/:id/subjects/:subjectType/:subjectId',
  validate(paramObjectId('id', 'Survey id')),
  validate(paramObjectId('subjectId', 'Subject id')),
  putSubjectResponse
);
router.get(
  '/:id/responses',
  validate(paramObjectId('id', 'Survey id')),
  authorize('SURVEY:READ', { param: 'id' }),
  listSurveyResponses
);
router.post('/:id/responses', validate(paramObjectId('id', 'Survey id')), submitSurveyResponse);
router.get(
  '/:id',
  validate(paramObjectId('id', 'Survey id')),
  authorize('SURVEY:READ', { param: 'id' }),
  getSurveyById
);
router.put(
  '/:id',
  validate(paramObjectId('id', 'Survey id')),
  authorize('SURVEY:WRITE', { param: 'id' }),
  updateSurvey
);
router.delete(
  '/:id',
  validate(paramObjectId('id', 'Survey id')),
  authorize('SURVEY:DELETE', { param: 'id' }),
  deleteSurvey
);

module.exports = router;
