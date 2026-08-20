const { asyncHandler, sendError, ERROR_CODES, HttpError } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');
const {
  listPromptTemplates,
  updatePromptTemplates,
  startMatchRun,
  getMatchRun,
  cancelMatchRun,
  listOpportunityMatches,
  listMatchRuns,
  createProjectFromMatch,
} = require('../services/opportunityMatchService');

function handleMatchError(res, error, fallback) {
  if (error instanceof HttpError) {
    return sendError(res, error.status, error.message, { code: error.code, details: error.details });
  }
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message, {
      code: error.code || ERROR_CODES.VALIDATION,
    });
  }
  console.error(fallback, error);
  return sendError(res, 500, fallback, ERROR_CODES.INTERNAL);
}

const listAiPrompts = asyncHandler(async (req, res) => {
  try {
    return res.json(await listPromptTemplates());
  } catch (error) {
    return handleMatchError(res, error, 'Failed to load AI prompts.');
  }
});

const updateAiPrompts = asyncHandler(async (req, res) => {
  try {
    return res.json(await updatePromptTemplates(req.body, req.user));
  } catch (error) {
    return handleMatchError(res, error, 'Failed to update AI prompts.');
  }
});

const listMatchRunsHandler = asyncHandler(async (req, res) => {
  try {
    return res.json(await listMatchRuns(req.user, req.query));
  } catch (error) {
    return handleMatchError(res, error, 'Failed to load opportunity match runs.');
  }
});

const createMatchRun = asyncHandler(async (req, res) => {
  try {
    const run = await startMatchRun(req.body, req.user);
    return res.status(202).json(run);
  } catch (error) {
    return handleMatchError(res, error, 'Failed to start opportunity match analysis.');
  }
});

const getMatchRunById = asyncHandler(async (req, res) => {
  try {
    return res.json(await getMatchRun(req.params.runId, req.user));
  } catch (error) {
    return handleMatchError(res, error, 'Failed to load opportunity match run.');
  }
});

const cancelMatchRunById = asyncHandler(async (req, res) => {
  try {
    return res.json(await cancelMatchRun(req.params.runId, req.user));
  } catch (error) {
    return handleMatchError(res, error, 'Failed to cancel opportunity match run.');
  }
});

const listMatchesForOpportunity = asyncHandler(async (req, res) => {
  try {
    return res.json(await listOpportunityMatches(req.params.id, req.user));
  } catch (error) {
    return handleMatchError(res, error, 'Failed to load opportunity county matches.');
  }
});

const createProjectFromCountyMatch = asyncHandler(async (req, res) => {
  try {
    const result = await createProjectFromMatch(req.params.id, req.params.runId, req.params.countyId, req.user);
    return res.status(result.reused ? 200 : 201).json(result.project);
  } catch (error) {
    return handleMatchError(res, error, 'Failed to create project from match.');
  }
});

module.exports = {
  listAiPrompts,
  updateAiPrompts,
  createMatchRun,
  getMatchRunById,
  cancelMatchRunById,
  listMatchesForOpportunity,
  listMatchRuns: listMatchRunsHandler,
  createProjectFromCountyMatch,
};
