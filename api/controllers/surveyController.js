const mongoose = require('mongoose');
const Survey = require('../models/assets/Survey');
const { sendServerError, sendError, ERROR_CODES, HttpError } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');
const { activeFilter, applyTrash } = require('../services/trash');
const { textSearchOr } = require('../utils/listQuery');
const {
  serializeInstrument,
  serializeInstrumentDetail,
  createInstrument,
  updateInstrument,
  updateInstrumentCounties,
  setCountyInstrumentVersion,
  listAssignedInstrumentCounties,
  previewInstrumentCounties,
  bulkUpdateInstrumentCounties,
  publishInstrument,
  setActiveInstrumentVersion,
  readSubjectResponse,
  saveSubjectResponse,
  trashSubjectResponse,
  listSubjectRevisions,
  listInstrumentResponses,
  listAccessibleAnswers,
  listAnswerableCounties,
  listSubjectInstruments,
} = require('../services/surveyInstrumentService');

function handleError(res, error, fallback) {
  if (error instanceof HttpError) {
    return sendError(res, error.status, error.message, { code: error.code, details: error.details });
  }
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message, ERROR_CODES.VALIDATION);
  }
  return sendServerError(res, error, fallback);
}

const SORT_FIELDS = new Set(['name', 'createdAt', 'updatedAt', 'questionCount']);

function parseListQuery(query = {}) {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
  const limitRaw = parseInt(String(query.limit || '10'), 10) || 10;
  const limit = Math.min(100, Math.max(1, limitRaw));
  const search = String(query.search || query.q || '').trim();
  const sortField = SORT_FIELDS.has(String(query.sort || '')) ? String(query.sort) : 'updatedAt';
  const order = String(query.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const createdBy = String(query.createdBy || '').trim();
  return { page, limit, search, sortField, order, createdBy };
}

async function loadSurvey(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Survey.findOne(activeFilter({ _id: id }))
    .populate('ownerId', 'username email')
    .populate('createdBy', 'username email')
    .populate('updatedBy', 'username email');
}

exports.listSurveys = async (req, res) => {
  try {
    const { page, limit, search, sortField, order, createdBy } = parseListQuery(req.query);
    const filter = activeFilter();
    const access = req.accessibleResources;
    if (access && !access.all) {
      if (!access.ids.length) {
        return res.status(200).json({
          items: [],
          page,
          limit,
          total: 0,
          totalPages: 0,
          sort: sortField,
          order,
          search,
          filters: { createdBy: createdBy || null },
        });
      }
      filter._id = { $in: access.ids };
    }
    if (search) {
      filter.$or = textSearchOr(
        ['name', 'description', 'questions.code', 'questions.prompt', 'questions.area'],
        search
      );
    }
    if (createdBy) {
      if (!mongoose.isValidObjectId(createdBy)) {
        return sendError(res, 400, 'Invalid createdBy filter.', ERROR_CODES.VALIDATION);
      }
      filter.createdBy = createdBy;
    }
    const total = await Survey.countDocuments(filter);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const sortDir = order === 'asc' ? 1 : -1;
    const surveys = await Survey.find(filter)
      .select('-questions')
      .sort({ [sortField]: sortDir, _id: sortDir })
      .skip(skip)
      .limit(limit)
      .populate('ownerId', 'username email')
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .lean();
    const items = surveys.map((survey) => serializeInstrument(survey, { includeQuestions: false }));
    res.status(200).json({
      items,
      page,
      limit,
      total,
      totalPages,
      sort: sortField,
      order,
      search,
      filters: { createdBy: createdBy || null },
    });
  } catch (error) {
    return handleError(res, error, 'Error listing surveys');
  }
};

exports.createSurvey = async (req, res) => {
  try {
    const created = await createInstrument(req.body, req.user._id);
    res.status(201).json(created);
  } catch (error) {
    return handleError(res, error, 'Error creating survey');
  }
};

exports.getSurveyById = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    res.status(200).json(await serializeInstrumentDetail(survey));
  } catch (error) {
    return handleError(res, error, 'Error fetching survey');
  }
};

exports.updateSurvey = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    res.status(200).json(await updateInstrument(survey, req.body, req.user._id));
  } catch (error) {
    return handleError(res, error, 'Error updating survey');
  }
};

exports.updateSurveyCounties = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    res.status(200).json(await updateInstrumentCounties(survey, req.body, req.user._id));
  } catch (error) {
    return handleError(res, error, 'Error updating assigned counties');
  }
};

exports.listSurveyCounties = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    res.status(200).json(await listAssignedInstrumentCounties(survey, req.query));
  } catch (error) {
    return handleError(res, error, 'Error listing assigned counties');
  }
};

exports.previewSurveyCounties = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    res.status(200).json(await previewInstrumentCounties(survey, req.body));
  } catch (error) {
    return handleError(res, error, 'Error previewing assigned counties');
  }
};

exports.bulkUpdateSurveyCounties = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    res.status(200).json(await bulkUpdateInstrumentCounties(survey, req.body, req.user._id));
  } catch (error) {
    return handleError(res, error, 'Error updating assigned counties');
  }
};

exports.setSurveyCountyVersion = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    res.json(await setCountyInstrumentVersion(survey, req.params.countyId, req.body, req.user._id));
  } catch (error) {
    return handleError(res, error, 'Error setting county survey version');
  }
};

exports.deleteSurvey = async (req, res) => {
  try {
    const survey = await Survey.findOne(activeFilter({ _id: req.params.id }));
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    applyTrash(survey, req.user._id);
    await survey.save();
    res.status(200).json({ message: 'Survey moved to recycle bin.' });
  } catch (error) {
    return handleError(res, error, 'Error deleting survey');
  }
};

exports.publishSurvey = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    await publishInstrument(survey, req.user._id);
    res.json(await serializeInstrumentDetail(survey));
  } catch (error) {
    return handleError(res, error, 'Error publishing survey');
  }
};

exports.setSurveyActiveVersion = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    res.json(await setActiveInstrumentVersion(survey, req.body, req.user._id));
  } catch (error) {
    return handleError(res, error, 'Error setting active survey version');
  }
};

exports.getSubjectResponse = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    const payload = await readSubjectResponse(
      survey,
      req.params.subjectType,
      req.params.subjectId,
      req.user
    );
    res.json(payload);
  } catch (error) {
    return handleError(res, error, 'Error loading response');
  }
};

exports.putSubjectResponse = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    const payload = await saveSubjectResponse(
      survey,
      req.params.subjectType,
      req.params.subjectId,
      req.body,
      req.user
    );
    res.json(payload);
  } catch (error) {
    return handleError(res, error, 'Error saving response');
  }
};

exports.deleteSubjectResponse = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    const payload = await trashSubjectResponse(
      survey,
      req.params.subjectType,
      req.params.subjectId,
      req.user
    );
    res.status(200).json(payload);
  } catch (error) {
    return handleError(res, error, 'Error deleting response');
  }
};

exports.listSubjectRevisions = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    const payload = await listSubjectRevisions(
      survey,
      req.params.subjectType,
      req.params.subjectId,
      req.user
    );
    res.json(payload);
  } catch (error) {
    return handleError(res, error, 'Error listing revisions');
  }
};

exports.submitSurveyResponse = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    const subjectType = req.body.subjectType || req.query.subjectType;
    const subjectId = req.body.subjectId || req.query.subjectId;
    if (!subjectType || !subjectId) {
      return sendError(res, 400, 'subjectType and subjectId are required.', ERROR_CODES.VALIDATION);
    }
    const payload = await saveSubjectResponse(survey, subjectType, subjectId, req.body, req.user);
    res.status(201).json(payload);
  } catch (error) {
    return handleError(res, error, 'Error submitting response');
  }
};

exports.listSurveyResponses = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    const payload = await listInstrumentResponses(survey, req.user);
    res.status(200).json(payload);
  } catch (error) {
    return handleError(res, error, 'Error listing responses');
  }
};

exports.listAccessibleAnswers = async (req, res) => {
  try {
    const payload = await listAccessibleAnswers(req.user);
    res.status(200).json(payload);
  } catch (error) {
    return handleError(res, error, 'Error listing answers');
  }
};

exports.listAnswerableCounties = async (req, res) => {
  try {
    const survey = await loadSurvey(req.params.id);
    if (!survey) return sendError(res, 404, 'Survey not found.', ERROR_CODES.NOT_FOUND);
    const payload = await listAnswerableCounties(survey, req.user, req.query);
    res.status(200).json(payload);
  } catch (error) {
    return handleError(res, error, 'Error listing answerable counties');
  }
};

exports.listSubjectInstruments = async (req, res) => {
  try {
    const payload = await listSubjectInstruments(
      req.params.subjectType,
      req.params.subjectId,
      req.user
    );
    res.json(payload);
  } catch (error) {
    return handleError(res, error, 'Error listing subject instruments');
  }
};
