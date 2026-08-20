const { asyncHandler, sendError, ERROR_CODES, HttpError } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');
const { recordAction } = require('../services/actionLogService');
const {
  serializeAnalysis,
  serializeStoredFile,
  loadStoredFile,
} = require('../services/storedFileService');
const {
  isAnalyzableMime,
  fundingPrompt,
  analysisLocationForStoredFile,
  persistAnalysisResult,
  parseAnalysisResult,
  analysisResultText,
  createAnalysis,
  getAnalysis,
  getAnalysisStatus,
  getQueue,
  findQueueJob,
  cancelAnalysis,
} = require('../services/rtcnaiService');

const JOB_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const IN_FLIGHT = new Set(['queued', 'running']);
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

function errorStage(error) {
  const code = error?.code;
  if (code === ERROR_CODES.UNAVAILABLE) return 'connect';
  if (code === ERROR_CODES.CONFIG) return 'config';
  if (code === ERROR_CODES.VALIDATION) return 'validation';
  if (error?.status === 502 || error?.status === 503) return 'upstream';
  return 'processing';
}

function isOperationalAnalysisError(error) {
  if (error instanceof ValidationError) return false;
  const status = error?.status || error?.statusCode || 500;
  return status !== 400 && status !== 403 && status !== 404;
}

function analysisErrorMeta(req, error, extra = {}) {
  const cause = error?.cause instanceof Error ? error.cause.message : error?.cause;
  return {
    stage: extra.stage || errorStage(error),
    fileId: extra.fileId || req.params?.fileId || null,
    jobId: extra.jobId || req.params?.jobId || null,
    code: extra.code || error?.code || null,
    debugError: extra.debugError || cause || error?.message || String(error || 'Document analysis failed.'),
  };
}

function attachAnalysisLogContext(req, { message, meta }) {
  req.actionLogContext = {
    ...(req.actionLogContext || {}),
    action: 'opportunity.analyze',
    resourceType: 'OPPORTUNITY',
    resourceId: req.params.id,
    message,
    meta: { ...(req.actionLogContext?.meta || {}), ...meta },
  };
}

function requestLogFields(req) {
  return {
    userId: req.user?._id || null,
    username: req.user?.username || '',
    ipAddress: req.ip || req.socket?.remoteAddress || '',
    userAgent: req.get?.('user-agent') || '',
  };
}

function logAnalysisFailure(req, error, extra = {}) {
  const message = extra.message || error?.message || 'Document analysis failed.';
  const meta = analysisErrorMeta(req, error, extra);
  attachAnalysisLogContext(req, { message, meta });
  if (String(req.method || '').toUpperCase() !== 'GET') {
    return;
  }
  void recordAction({
    ...requestLogFields(req),
    action: 'opportunity.analyze',
    resourceType: 'OPPORTUNITY',
    resourceId: req.params.id,
    method: 'GET',
    path: (req.originalUrl || req.url || '').split('?')[0],
    statusCode: extra.statusCode || error?.status || error?.statusCode || 500,
    success: false,
    message,
    meta,
  });
}

function handleAnalysisError(req, res, error, fallback) {
  if (isOperationalAnalysisError(error)) {
    logAnalysisFailure(req, error, { message: error?.message || fallback });
  } else {
    attachAnalysisLogContext(req, {
      message: error?.message || fallback,
      meta: analysisErrorMeta(req, error, { stage: errorStage(error) }),
    });
  }
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

function analysisStatusOf(doc) {
  return String(doc.analysis?.status || '').toLowerCase();
}

const NOT_IN_QUEUE_MESSAGE = 'Document is not in the analysis queue.';

function serializeAnalysisResponse(doc) {
  const analysis = serializeAnalysis(doc.analysis) || {};
  const result = parseAnalysisResult(analysis.result);
  return {
    jobId: analysis.jobId || null,
    status: analysis.status || null,
    summary: result,
    responseFormat: result && typeof result === 'object' ? 'json' : 'text',
    statusSummary: analysis.statusSummary || null,
    error: analysis.error || null,
    model: analysis.model || null,
    requestedAt: analysis.requestedAt || null,
    completedAt: analysis.completedAt || null,
    progressStep: analysis.progressStep || null,
    progressCompleted: analysis.progressCompleted ?? null,
    progressTotal: analysis.progressTotal ?? null,
    queuePosition: analysis.queuePosition ?? null,
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
    statusSummary: 'Document is in the analysis queue.',
    progressStep: 'queued',
    progressCompleted: 1,
    progressTotal: 6,
    queuePosition: null,
    requestedAt: new Date(),
    completedAt: null,
    resultLoggedAt: null,
  };
}

function applyQueueItem(doc, item) {
  const outcome = String(item?.outcome || item?.status || '').toLowerCase();
  const status = outcome === 'running' ? 'running' : 'queued';
  if (!doc.analysis) doc.analysis = {};
  const jobId = String(item?.job_id || item?.jobId || doc.analysis.jobId || '').trim();
  if (jobId) doc.analysis.jobId = jobId;
  doc.analysis.status = status;
  doc.analysis.error = null;
  const position = item?.position;
  doc.analysis.queuePosition = typeof position === 'number' ? position : null;
  const step = item?.current_step || item?.currentStep || status;
  doc.analysis.progressStep = step;
  if (status === 'queued') {
    const posLabel = doc.analysis.queuePosition != null ? ` (position ${doc.analysis.queuePosition})` : '';
    doc.analysis.statusSummary = `Document is in the analysis queue${posLabel}.`;
  } else {
    doc.analysis.statusSummary = `Document is being processed (${step}).`;
  }
  if (!doc.analysis.requestedAt) doc.analysis.requestedAt = new Date();
  doc.analysis.completedAt = null;
}

function applyStatusView(doc, statusView) {
  const outcome = String(statusView?.outcome || statusView?.status || '').toLowerCase();
  if (!doc.analysis) doc.analysis = {};
  if (outcome) doc.analysis.status = outcome;
  if (statusView?.summary) doc.analysis.statusSummary = String(statusView.summary).slice(0, 2000);
  if (statusView?.progress) {
    doc.analysis.progressStep = statusView.progress.current_step || statusView.progress.currentStep || null;
    doc.analysis.progressCompleted =
      statusView.progress.completed_steps ?? statusView.progress.completedSteps ?? null;
    doc.analysis.progressTotal = statusView.progress.total_steps ?? statusView.progress.totalSteps ?? null;
  }
  if (statusView?.analysis?.model) {
    doc.analysis.model = statusView.analysis.model;
  }
  if (outcome === 'failed') {
    const failedMessage =
      statusView?.error?.message || statusView?.summary || 'Document analysis failed.';
    doc.analysis.error = String(failedMessage).slice(0, 2000);
    doc.analysis.result = null;
    doc.analysis.queuePosition = null;
    doc.analysis.completedAt = new Date();
  }
  if (outcome === 'succeeded') {
    doc.analysis.error = null;
    doc.analysis.queuePosition = null;
    doc.analysis.completedAt = doc.analysis.completedAt || new Date();
  }
  if (outcome === 'cancelled') {
    doc.analysis.error = null;
    doc.analysis.result = null;
    doc.analysis.queuePosition = null;
    doc.analysis.statusSummary =
      statusView?.summary || 'Document analysis was cancelled.';
    doc.analysis.progressStep = 'cancelled';
    doc.analysis.completedAt = new Date();
  }
  return outcome;
}

function applyFullResult(doc, data) {
  const result = persistAnalysisResult(data?.analysis?.result);
  if (result) doc.analysis.result = result;
  if (data?.analysis?.model) doc.analysis.model = data.analysis.model;
  doc.analysis.status = 'succeeded';
  doc.analysis.error = null;
  doc.analysis.completedAt = new Date();
}

function logTerminalResult(req, doc, statusView) {
  if (doc.analysis?.resultLoggedAt) return;
  const outcome = analysisStatusOf(doc);
  if (!TERMINAL.has(outcome)) return;
  doc.analysis.resultLoggedAt = new Date();
  const rtcnaiMessage =
    statusView?.summary ||
    doc.analysis.statusSummary ||
    (outcome === 'succeeded'
      ? 'Document analysis completed successfully'
      : outcome === 'cancelled'
        ? 'Document analysis was cancelled.'
        : 'Document analysis failed.');
  const errorCode =
    statusView?.error?.code ||
    (outcome === 'succeeded' ? null : outcome === 'cancelled' ? 'CANCELLED' : 'ANALYSIS_FAILED');
  const meta = {
    stage:
      outcome === 'succeeded'
        ? 'result'
        : outcome === 'cancelled'
          ? 'cancel'
          : errorCode === 'NOT_IN_QUEUE'
            ? 'queue'
            : 'processing',
    fileId: String(doc._id),
    jobId: doc.analysis.jobId,
    code: errorCode,
    rtcnaiMessage,
    result: outcome === 'succeeded' ? analysisResultText(doc.analysis.result) : '',
    debugError: outcome === 'failed' ? rtcnaiMessage : undefined,
  };
  attachAnalysisLogContext(req, { message: rtcnaiMessage, meta });
  void recordAction({
    ...requestLogFields(req),
    action: 'opportunity.analyze',
    resourceType: 'OPPORTUNITY',
    resourceId: req.params.id,
    method: String(req.method || 'GET').toUpperCase(),
    path: (req.originalUrl || req.url || '').split('?')[0],
    statusCode: 200,
    success: outcome === 'succeeded' || outcome === 'cancelled',
    message: rtcnaiMessage,
    meta,
  });
}

function markNotInQueue(req, doc) {
  if (!doc.analysis) doc.analysis = {};
  doc.analysis.status = 'failed';
  doc.analysis.error = NOT_IN_QUEUE_MESSAGE;
  doc.analysis.statusSummary = NOT_IN_QUEUE_MESSAGE;
  doc.analysis.queuePosition = null;
  doc.analysis.result = null;
  doc.analysis.completedAt = new Date();
  logTerminalResult(req, doc, {
    summary: NOT_IN_QUEUE_MESSAGE,
    error: { code: 'NOT_IN_QUEUE', message: NOT_IN_QUEUE_MESSAGE },
  });
}

function applyCancelled(doc, data) {
  if (!doc.analysis) doc.analysis = {};
  const jobId = String(data?.job_id || data?.jobId || doc.analysis.jobId || '').trim();
  if (jobId) doc.analysis.jobId = jobId;
  doc.analysis.status = 'cancelled';
  doc.analysis.error = null;
  doc.analysis.result = null;
  doc.analysis.queuePosition = null;
  doc.analysis.statusSummary = 'Document analysis was cancelled.';
  doc.analysis.progressStep = 'cancelled';
  doc.analysis.completedAt = new Date();
}

async function syncAnalysisFromRtcnai(req, doc, { queue } = {}) {
  const current = analysisStatusOf(doc);
  if (TERMINAL.has(current) && (current === 'failed' || current === 'cancelled' || doc.analysis.result)) {
    return current;
  }

  const location = analysisLocationForStoredFile(doc);
  const resolvedQueue = queue || (await getQueue());
  const queued = findQueueJob(resolvedQueue, {
    jobId: doc.analysis?.jobId,
    uri: location.uri,
  });
  if (queued) {
    applyQueueItem(doc, queued);
    return analysisStatusOf(doc);
  }

  const jobId = doc.analysis?.jobId;
  if (!jobId) {
    markNotInQueue(req, doc);
    return 'failed';
  }

  let statusView;
  try {
    statusView = await getAnalysisStatus(jobId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      markNotInQueue(req, doc);
      return 'failed';
    }
    throw error;
  }

  const outcome = applyStatusView(doc, statusView);

  if (outcome === 'succeeded' && !doc.analysis.result) {
    const full = await getAnalysis(jobId);
    applyFullResult(doc, full);
  }

  if (TERMINAL.has(outcome)) {
    logTerminalResult(req, doc, statusView);
  }
  return outcome;
}

const startOpportunityFileAnalysis = asyncHandler(async (req, res) => {
  try {
    const doc = await loadStoredFile(req.params.fileId);
    assertOpportunityFile(doc, req.params.id);
    if (!isAnalyzableMime(doc.mimeType)) {
      throw new ValidationError('Only PDF and Word (DOCX) files can be summarized.');
    }

    const location = analysisLocationForStoredFile(doc);
    const queue = await getQueue();
    const existing = findQueueJob(queue, {
      jobId: doc.analysis?.jobId,
      uri: location.uri,
    });
    if (existing) {
      applyQueueItem(doc, existing);
      await doc.save();
      return res.status(202).json(serializeAnalysisResponse(doc));
    }

    if (IN_FLIGHT.has(analysisStatusOf(doc)) && doc.analysis?.jobId) {
      await syncAnalysisFromRtcnai(req, doc, { queue });
      await doc.save();
      const synced = analysisStatusOf(doc);
      return res.status(IN_FLIGHT.has(synced) ? 202 : 200).json(serializeAnalysisResponse(doc));
    }

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
    return handleAnalysisError(req, res, error, 'Failed to start document analysis.');
  }
});

async function loadAndSyncAnalysis(req) {
  const doc = await loadStoredFile(req.params.fileId);
  assertOpportunityFile(doc, req.params.id);
  const requestedJobId = req.params.jobId ? assertJobId(req.params.jobId) : null;
  if (requestedJobId) {
    if (!doc.analysis?.jobId || doc.analysis.jobId !== requestedJobId) {
      throw new HttpError(404, 'Analysis job not found.', { code: ERROR_CODES.NOT_FOUND });
    }
  } else if (!doc.analysis?.jobId) {
    throw new HttpError(404, 'Analysis job not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  await syncAnalysisFromRtcnai(req, doc);
  await doc.save();
  return doc;
}

const getOpportunityFileAnalysis = asyncHandler(async (req, res) => {
  try {
    const doc = await loadAndSyncAnalysis(req);
    return res.json(serializeAnalysisResponse(doc));
  } catch (error) {
    return handleAnalysisError(req, res, error, 'Failed to load document analysis.');
  }
});

const cancelOpportunityFileAnalysis = asyncHandler(async (req, res) => {
  try {
    const doc = await loadStoredFile(req.params.fileId);
    assertOpportunityFile(doc, req.params.id);
    const jobId = assertJobId(req.params.jobId);
    if (!doc.analysis?.jobId || doc.analysis.jobId !== jobId) {
      throw new HttpError(404, 'Analysis job not found.', { code: ERROR_CODES.NOT_FOUND });
    }

    const current = analysisStatusOf(doc);
    if (current === 'cancelled') {
      return res.json(serializeAnalysisResponse(doc));
    }
    if (TERMINAL.has(current) && current !== 'cancelled') {
      throw new HttpError(409, 'Completed jobs cannot be cancelled.', { code: ERROR_CODES.CONFLICT });
    }

    try {
      const cancelled = await cancelAnalysis(jobId);
      applyCancelled(doc, cancelled);
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        await syncAnalysisFromRtcnai(req, doc);
        await doc.save();
        return res.json(serializeAnalysisResponse(doc));
      }
      if (error instanceof HttpError && error.status === 404) {
        markNotInQueue(req, doc);
        await doc.save();
        return res.json(serializeAnalysisResponse(doc));
      }
      throw error;
    }

    logTerminalResult(req, doc, {
      summary: doc.analysis.statusSummary,
      error: { code: 'CANCELLED', message: doc.analysis.statusSummary },
    });
    await doc.save();
    return res.json(serializeAnalysisResponse(doc));
  } catch (error) {
    return handleAnalysisError(req, res, error, 'Failed to cancel document analysis.');
  }
});

module.exports = {
  startOpportunityFileAnalysis,
  getOpportunityFileAnalysis,
  cancelOpportunityFileAnalysis,
};
