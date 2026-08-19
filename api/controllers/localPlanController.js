const { sendError, sendServerError, ERROR_CODES, HttpError } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');
const {
  previewLocalPlan,
  createLocalPlan,
  listLocalPlans,
  getLocalPlan,
  updateLocalPlan,
  setDefaultLocalPlan,
  deleteLocalPlan,
  listLocalPlanChanges,
} = require('../services/localPlanService');

function handleError(res, error, fallback) {
  if (error instanceof HttpError) {
    return sendError(res, error.status, error.message, { code: error.code, details: error.details });
  }
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message, ERROR_CODES.VALIDATION);
  }
  return sendServerError(res, error, fallback);
}

exports.listLocalPlans = async (req, res) => {
  try {
    res.json(await listLocalPlans(req.query, req.user));
  } catch (error) {
    return handleError(res, error, 'Error listing local plans');
  }
};

exports.previewLocalPlan = async (req, res) => {
  try {
    res.json(await previewLocalPlan({ ...req.query, questionIds: req.query.questionIds }, req.user));
  } catch (error) {
    return handleError(res, error, 'Error previewing local plan');
  }
};

exports.createLocalPlan = async (req, res) => {
  try {
    res.status(201).json(await createLocalPlan(req.body, req.user));
  } catch (error) {
    return handleError(res, error, 'Error creating local plan');
  }
};

exports.getLocalPlan = async (req, res) => {
  try {
    res.json(await getLocalPlan(req.params.id, req.user));
  } catch (error) {
    return handleError(res, error, 'Error loading local plan');
  }
};

exports.updateLocalPlan = async (req, res) => {
  try {
    res.json(await updateLocalPlan(req.params.id, req.body, req.user));
  } catch (error) {
    return handleError(res, error, 'Error updating local plan');
  }
};

exports.setDefaultLocalPlan = async (req, res) => {
  try {
    res.json(await setDefaultLocalPlan(req.params.id, req.user));
  } catch (error) {
    return handleError(res, error, 'Error setting default local plan');
  }
};

exports.deleteLocalPlan = async (req, res) => {
  try {
    res.json(await deleteLocalPlan(req.params.id, req.user));
  } catch (error) {
    return handleError(res, error, 'Error deleting local plan');
  }
};

exports.listLocalPlanChanges = async (req, res) => {
  try {
    res.json(await listLocalPlanChanges(req.params.id, req.user));
  } catch (error) {
    return handleError(res, error, 'Error loading local plan changes');
  }
};
