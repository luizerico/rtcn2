const { asyncHandler, sendError, ERROR_CODES, HttpError } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');
const {
  serializeAnalysis,
  serializeStoredFile,
  loadStoredFile,
} = require('../services/storedFileService');
const {
  isAnalyzableMime,
  fundingPrompt,
  analysisLocationForStoredFile,
  createAnalysis,
  getAnalysis,
} = require('../services/rtcnaiService');

const JOB_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function handleAnalysisError(res, error, fallback) {
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

function assertOpportunityFile(doc, opportunityId) {
  if (doc.ownerType !== 'opportunity' || String(doc.ownerId) !== String(opportunityId)) {
    throw new HttpError(404, 'File not found.', { code: ERROR_CODES.NOT_FOUND });
  }
}

function assertJobId(raw) {
  const jobId = String(raw || '').trim();
  if (!JOB_ID_RE.test(jobId)) {
    throw new HttpError(400, 'Invalid analysis job id.', { code: ERROR_CODES.VALIDATION });
  }
  return jobId;
}

function serializeAnalysisResponse(doc) {
  const analysis = serializeAnalysis(doc.analysis) || {};
  return {
    jobId: analysis.jobId || null,
    status: analysis.status || null,
    summary: analysis.result || null,
    error: analysis.error || null,
    model: analysis.model || null,
    requestedAt: analysis.requestedAt || null,
    completedAt: analysis.completedAt || null,
    file: serializeStoredFile(doc),
  };
}

function applyQueuedAnalysis(doc, jobId, status) {
  doc.analysis = {
    jobId,
    status: status || 'queued',
    result: null,
    error: null,
    model: null,
    requestedAt: new Date(),
    completedAt: null,
  };
}

function applyTerminalAnalysis(doc, data) {
  const status = String(data?.status || '').toLowerCase();
  const failedMessage = data?.error?.message || null;
  doc.analysis.status = status;
  doc.analysis.result = status === 'succeeded' ? data?.analysis?.result || null : null;
  doc.analysis.error = status === 'failed' ? failedMessage || 'Document analysis failed.' : null;
  doc.analysis.model = data?.analysis?.model || null;
  doc.analysis.completedAt = new Date();
}

const startOpportunityFileAnalysis = asyncHandler(async (req, res) => {
  try {
    const doc = await loadStoredFile(req.params.fileId);
    assertOpportunityFile(doc, req.params.id);
    if (!isAnalyzableMime(doc.mimeType)) {
      throw new ValidationError('Only PDF and Word (DOCX) files can be summarized.');
    }

    const location = analysisLocationForStoredFile(doc);
    const created = await createAnalysis({
      provider: location.provider,
      uri: location.uri,
      prompt: fundingPrompt(),
    });
    const jobId = String(created.job_id || created.jobId || '').trim();
    if (!JOB_ID_RE.test(jobId)) {
      throw new HttpError(502, 'Invalid analysis service response.', { code: ERROR_CODES.INTERNAL });
    }

    applyQueuedAnalysis(doc, jobId, created.status);
    await doc.save();
    return res.status(202).json(serializeAnalysisResponse(doc));
  } catch (error) {
    return handleAnalysisError(res, error, 'Failed to start document analysis.');
  }
});

const getOpportunityFileAnalysis = asyncHandler(async (req, res) => {
  try {
    const jobId = assertJobId(req.params.jobId);
    const doc = await loadStoredFile(req.params.fileId);
    assertOpportunityFile(doc, req.params.id);
    if (!doc.analysis?.jobId || doc.analysis.jobId !== jobId) {
      throw new HttpError(404, 'Analysis job not found.', { code: ERROR_CODES.NOT_FOUND });
    }

    const current = String(doc.analysis.status || '').toLowerCase();
    if (current === 'succeeded' || current === 'failed') {
      return res.json(serializeAnalysisResponse(doc));
    }

    const data = await getAnalysis(jobId);
    const status = String(data?.status || '').toLowerCase();
    if (status === 'succeeded' || status === 'failed') {
      applyTerminalAnalysis(doc, { ...data, status });
      await doc.save();
    } else if (status) {
      doc.analysis.status = status;
      await doc.save();
    }

    return res.json(serializeAnalysisResponse(doc));
  } catch (error) {
    return handleAnalysisError(res, error, 'Failed to load document analysis.');
  }
});

module.exports = {
  startOpportunityFileAnalysis,
  getOpportunityFileAnalysis,
};
