const crypto = require('crypto');
const mongoose = require('mongoose');
const AiPromptTemplate = require('../models/AiPromptTemplate');
const OpportunityMatchRun = require('../models/OpportunityMatchRun');
const Opportunity = require('../models/assets/Opportunity');
const Project = require('../models/assets/Project');
const User = require('../models/User');
const { ASSET_TYPE_LABELS } = require('../constants/assetTypes');
const {
  PROMPT_KEYS,
  PROMPT_LABELS,
  DEFAULT_PROMPTS,
  MATCH_MODES,
  RUN_STATUSES,
  COUNTY_BATCH_SIZE,
  SCORE_WEIGHTS,
  IN_FLIGHT,
  TERMINAL,
  clampPrompt,
} = require('../constants/opportunityMatch');
const { parseProjectBody } = require('../controllers/fundingParse');
const { userHasPermission, userIsAdminGroupMember } = require('./rbacService');
const { parseListQuery, clampPage, paginatedResponse, escapeRegex } = require('../utils/listQuery');
const { getStorageDriver } = require('./storage');
const { buildJsonContext } = require('./jsonContext');
const {
  analysisLocationForStoredFile,
  persistAnalysisResult,
  parseAnalysisResult,
  createAnalysis,
  getAnalysis,
  getAnalysisStatus,
  getQueue,
  findQueueJob,
  cancelAnalysis,
} = require('./rtcnaiService');
const { loadOpportunityContext, loadCandidateCounties, idStr } = require('./opportunityMatchContext');
const {
  extractJson,
  simulateGrade,
  buildDimensions,
  overallScore,
} = require('./opportunityMatchScore');
const { activeFilter } = require('./trash');
const { HttpError, ERROR_CODES } = require('../utils/httpErrors');
const { ValidationError, objectId, oneOf } = require('../validation');

const JOB_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const NOT_IN_QUEUE_MESSAGE = 'Document is not in the analysis queue.';

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function serializeActor(ref) {
  if (!ref) return null;
  if (typeof ref === 'object' && ref._id) {
    return { _id: String(ref._id), username: ref.username || '', email: ref.email || '' };
  }
  return { _id: String(ref) };
}

function serializeDimensions(dims) {
  const obj = dims && typeof dims.toObject === 'function' ? dims.toObject() : dims || {};
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('_')) continue;
    out[key] = {
      score: Number(value?.score) || 0,
      note: value?.note || '',
    };
  }
  return out;
}

function serializeMatch(row) {
  const obj = typeof row.toObject === 'function' ? row.toObject() : row;
  return {
    opportunityId: idStr(obj.opportunityId),
    countyId: idStr(obj.countyId),
    countyName: obj.countyName || '',
    IBGECode: obj.IBGECode || '',
    gradeBefore: obj.gradeBefore || {},
    gradeAfter: obj.gradeAfter || {},
    matchedCodes: obj.matchedCodes || [],
    dimensions: serializeDimensions(obj.dimensions),
    overallScore: obj.overallScore || 0,
    rationale: obj.rationale || '',
    projectId: obj.projectId ? String(obj.projectId) : null,
  };
}

function serializeStep(step, { detailed = false } = {}) {
  const obj = typeof step.toObject === 'function' ? step.toObject() : step;
  const row = {
    _id: String(obj._id),
    key: obj.key,
    kind: obj.kind,
    opportunityId: idStr(obj.opportunityId),
    batchIndex: obj.batchIndex || 0,
    jobId: obj.jobId || '',
    status: obj.status,
    error: obj.error || '',
  };
  if (!detailed) return row;
  return {
    ...row,
    prompt: obj.prompt || '',
    request: obj.request || null,
    requestPayload: obj.requestPayload || null,
    rawResult: parseAnalysisResult(obj.rawResult) || obj.rawResult || null,
    profile: obj.profile || null,
    countyIds: (obj.countyIds || []).map((id) => String(id)),
    storageKey: obj.storageKey || '',
    storageDriver: obj.storageDriver || '',
  };
}

function serializeOpportunities(refs) {
  return (refs || []).map((ref) => {
    if (ref && typeof ref === 'object' && ref._id) {
      return { _id: String(ref._id), name: ref.name || '' };
    }
    return { _id: String(ref), name: '' };
  });
}

function serializeRun(doc, { opportunityId, detailed = false } = {}) {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  let matches = (obj.matches || []).map(serializeMatch);
  if (opportunityId) {
    matches = matches.filter((row) => row.opportunityId === String(opportunityId));
  }
  matches.sort((a, b) => b.overallScore - a.overallScore);
  const opportunities = serializeOpportunities(obj.opportunityIds);
  return {
    _id: String(obj._id),
    opportunityIds: opportunities.map((row) => row._id),
    opportunities,
    mode: obj.mode,
    status: obj.status,
    error: obj.error || '',
    candidateCount: obj.candidateCount || 0,
    promptSnapshot: obj.promptSnapshot || {},
    scoreWeights: SCORE_WEIGHTS,
    steps: (obj.steps || []).map((step) => serializeStep(step, { detailed })),
    matches,
    createdBy: serializeActor(obj.createdBy),
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

async function ensurePromptTemplates() {
  const existing = await AiPromptTemplate.find({ key: { $in: Object.values(PROMPT_KEYS) } }).lean();
  const have = new Set(existing.map((row) => row.key));
  const inserts = [];
  for (const key of Object.values(PROMPT_KEYS)) {
    if (have.has(key)) continue;
    inserts.push({
      key,
      name: PROMPT_LABELS[key],
      body: clampPrompt(DEFAULT_PROMPTS[key]),
    });
  }
  if (inserts.length) await AiPromptTemplate.insertMany(inserts);
  return AiPromptTemplate.find({ key: { $in: Object.values(PROMPT_KEYS) } }).sort({ key: 1 });
}

function serializePrompt(doc) {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    key: obj.key,
    name: obj.name,
    body: obj.body,
    maxLength: 8000,
    updatedAt: obj.updatedAt,
    updatedBy: serializeActor(obj.updatedBy),
  };
}

async function listPromptTemplates() {
  const docs = await ensurePromptTemplates();
  return { items: docs.map(serializePrompt) };
}

async function updatePromptTemplates(body, user) {
  const items = Array.isArray(body?.items) ? body.items : body?.key ? [body] : [];
  if (!items.length) throw new ValidationError('Provide at least one prompt to update.');
  await ensurePromptTemplates();
  const updated = [];
  for (const item of items) {
    const key = oneOf(item.key, Object.values(PROMPT_KEYS), 'key');
    const raw = String(item.body ?? '');
    if (!raw.trim()) throw new ValidationError(`Prompt ${key} cannot be empty.`);
    const bodyText = clampPrompt(raw.trim());
    const doc = await AiPromptTemplate.findOneAndUpdate(
      { key },
      { $set: { body: bodyText, name: PROMPT_LABELS[key], updatedBy: user._id } },
      { returnDocument: 'after' }
    );
    updated.push(doc);
  }
  return { items: updated.map(serializePrompt) };
}

async function loadPromptMap() {
  const docs = await ensurePromptTemplates();
  return Object.fromEntries(docs.map((row) => [row.key, clampPrompt(row.body)]));
}

async function assertOpportunityAccess(user, opportunityIds, action) {
  const raw = Array.isArray(opportunityIds) ? opportunityIds : opportunityIds ? [opportunityIds] : [];
  const ids = [...new Set(raw.map((id) => objectId(id && id._id ? id._id : id, 'opportunityId')))];
  if (!ids.length) throw new ValidationError('Select at least one opportunity.');
  if (await userIsAdminGroupMember(user)) {
    const found = await Opportunity.find(activeFilter({ _id: { $in: ids } })).select('_id');
    if (found.length !== ids.length) {
      throw new HttpError(404, 'Opportunity not found.', { code: ERROR_CODES.NOT_FOUND });
    }
    return ids;
  }
  for (const id of ids) {
    const allowed = await userHasPermission(user, `OPPORTUNITY:${action}`, { resourceId: String(id) });
    if (!allowed) {
      throw new HttpError(403, `Forbidden: Insufficient permissions for OPPORTUNITY:${action}.`, {
        code: ERROR_CODES.FORBIDDEN,
      });
    }
  }
  const found = await Opportunity.find(activeFilter({ _id: { $in: ids } })).select('_id');
  if (found.length !== ids.length) {
    throw new HttpError(404, 'Opportunity not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  return ids;
}

function planSteps(mode, opportunityIds, countyBatches) {
  const steps = [];
  for (const opportunityId of opportunityIds) {
    if (mode === 'deep') {
      steps.push({
        key: `profile-${opportunityId}`,
        kind: 'profile',
        opportunityId,
        batchIndex: 0,
        status: 'pending',
        countyIds: [],
      });
    }
    countyBatches.forEach((batch, index) => {
      steps.push({
        key: `match-${opportunityId}-${index}`,
        kind: 'match',
        opportunityId,
        batchIndex: index,
        status: 'pending',
        countyIds: batch.map((row) => row.countyId),
      });
    });
  }
  return steps;
}

function deriveRunStatus(run) {
  const steps = run.steps || [];
  if (!steps.length) return 'failed';
  if (steps.some((step) => IN_FLIGHT.has(step.status))) return 'running';
  if (steps.every((step) => step.status === 'cancelled')) return 'cancelled';
  const matchSteps = steps.filter((step) => step.kind === 'match');
  if (matchSteps.some((step) => step.status === 'succeeded')) return 'succeeded';
  if (steps.some((step) => step.status === 'pending')) return 'queued';
  return 'failed';
}

async function writeContextFile(runId, payload) {
  const driver = getStorageDriver();
  const storageKey = `opportunity-matches/${String(runId)}/${crypto.randomUUID()}.json`;
  await driver.put({
    key: storageKey,
    buffer: buildJsonContext(payload),
    contentType: 'application/json',
  });
  return { storageKey, storageDriver: driver.name };
}

function locationForStep(step) {
  return analysisLocationForStoredFile({
    storageDriver: step.storageDriver,
    storageKey: step.storageKey,
  });
}

async function startStep(run, step, { candidates, prompts }) {
  const opportunityId = idStr(step.opportunityId);
  const { opportunity, documentSummaries } = await loadOpportunityContext(opportunityId);
  const profile = run.opportunityProfiles?.[opportunityId] || null;
  const payload =
    step.kind === 'profile'
      ? { task: 'opportunity_profile', opportunity, documentSummaries }
      : {
          task: 'opportunity_county_match',
          opportunity,
          documentSummaries,
          opportunityProfile: profile,
          counties: (step.countyIds || [])
            .map((id) => candidates.byCountyId.get(String(id))?.pack)
            .filter(Boolean),
        };

  const promptKey =
    step.kind === 'profile'
      ? PROMPT_KEYS.DEEP_PROFILE
      : run.mode === 'deep'
        ? PROMPT_KEYS.DEEP_COUNTIES
        : PROMPT_KEYS.SHALLOW;
  const prompt = clampPrompt(prompts[promptKey] || DEFAULT_PROMPTS[promptKey]);

  if (!step.storageKey) {
    const stored = await writeContextFile(run._id, payload);
    step.storageKey = stored.storageKey;
    step.storageDriver = stored.storageDriver;
    step.prompt = prompt;
    step.requestPayload = payload;
    run.markModified('steps');
    await run.save();
  } else if (!step.requestPayload) {
    step.requestPayload = payload;
  }
  if (!step.prompt) step.prompt = prompt;

  const location = analysisLocationForStoredFile({
    storageDriver: step.storageDriver,
    storageKey: step.storageKey,
  });
  const request = {
    method: 'POST',
    path: '/v1/analyses',
    query: { response_format: 'json' },
    body: { provider: location.provider, uri: location.uri },
  };
  step.request = request;

  const queue = await getQueue();
  const existing = findQueueJob(queue, {
    jobId: step.jobId,
    uri: location.uri,
  });
  if (existing) {
    applyQueueItem(step, existing);
    run.markModified('steps');
    await run.save();
    return;
  }
  if (step.jobId) {
    run.markModified('steps');
    return;
  }

  const created = await createAnalysis({
    provider: location.provider,
    uri: location.uri,
    prompt,
  });
  const jobId = String(created.job_id || created.jobId || '').trim();
  if (!JOB_ID_RE.test(jobId)) {
    throw new HttpError(502, 'Invalid analysis service response.', { code: ERROR_CODES.INTERNAL });
  }
  step.jobId = jobId;
  step.status = created.status || 'queued';
  step.error = '';
  run.markModified('steps');
  await run.save();
}

async function startNextPending(run, ctx) {
  const pending = (run.steps || []).find((step) => step.status === 'pending');
  if (!pending) return false;
  if ((run.steps || []).some((step) => IN_FLIGHT.has(step.status))) return false;

  if (pending.kind === 'match' && run.mode === 'deep') {
    const profile = (run.steps || []).find(
      (step) => step.kind === 'profile' && idStr(step.opportunityId) === idStr(pending.opportunityId)
    );
    if (profile && profile.status !== 'succeeded') {
      if (profile.status === 'failed' || profile.status === 'cancelled') {
        pending.status = profile.status;
        pending.error = profile.error || 'Opportunity profile step did not succeed.';
        run.markModified('steps');
        return startNextPending(run, ctx);
      }
      return false;
    }
  }

  if (pending.jobId || pending.storageKey) {
    const location = pending.storageKey ? locationForStep(pending) : null;
    const queue = await getQueue();
    const existing = findQueueJob(queue, {
      jobId: pending.jobId,
      uri: location?.uri,
    });
    if (existing) {
      applyQueueItem(pending, existing);
      run.markModified('steps');
      return true;
    }
    if (pending.jobId) {
      pending.status = 'queued';
      run.markModified('steps');
      return true;
    }
  }

  await startStep(run, pending, ctx);
  return true;
}

function applyQueueItem(step, item) {
  const outcome = String(item?.outcome || item?.status || '').toLowerCase();
  step.status = outcome === 'running' ? 'running' : 'queued';
  const jobId = String(item?.job_id || item?.jobId || step.jobId || '').trim();
  if (jobId) step.jobId = jobId;
  step.error = '';
}

function applyStatusView(step, statusView) {
  const outcome = String(statusView?.outcome || statusView?.status || '').toLowerCase();
  if (outcome) step.status = outcome;
  if (outcome === 'failed') {
    step.error = String(statusView?.error?.message || statusView?.summary || 'Document analysis failed.').slice(
      0,
      2000
    );
    step.rawResult = '';
  }
  if (outcome === 'cancelled') {
    step.error = '';
    step.rawResult = '';
  }
  return outcome;
}

function lookupCodeMeta(countyData, match) {
  const questionId = String(match.questionId || '');
  const code = String(match.code || '').toUpperCase();
  for (const survey of countyData.surveys || []) {
    const item =
      (survey._versionItems || []).find((row) => String(row.questionId) === questionId) ||
      (survey._versionItems || []).find((row) => String(row.code || '').toUpperCase() === code);
    if (item) {
      return {
        questionId: String(item.questionId),
        code: item.code || match.code || '',
        area: item.area || '',
        todo: item.todo || item.prompt || '',
        proposedScore: match.proposedScore,
        reason: match.reason || '',
        technicalPriority: null,
        governmentPriority: null,
      };
    }
  }
  for (const plan of countyData.localPlans || []) {
    const entry =
      (plan.entries || []).find((row) => String(row.questionId) === questionId) ||
      (plan.entries || []).find((row) => String(row.code || '').toUpperCase() === code);
    if (entry) {
      return {
        questionId: String(entry.questionId),
        code: entry.code || match.code || '',
        area: entry.area || '',
        todo: entry.todo || '',
        proposedScore: match.proposedScore,
        reason: match.reason || '',
        technicalPriority: entry.technicalPriority,
        governmentPriority: entry.governmentPriority,
        consultant: entry.consultant,
        technical: entry.technical,
      };
    }
  }
  return null;
}

function upsertMatch(run, next) {
  const idx = (run.matches || []).findIndex(
    (row) =>
      idStr(row.opportunityId) === idStr(next.opportunityId) && idStr(row.countyId) === idStr(next.countyId)
  );
  if (idx >= 0) run.matches[idx] = next;
  else run.matches.push(next);
  run.markModified('matches');
}

function applyProfileResult(run, step, parsed) {
  const opportunityId = idStr(step.opportunityId);
  const profile = parsed?.profile || parsed || {};
  step.profile = profile;
  if (!run.opportunityProfiles || typeof run.opportunityProfiles !== 'object') {
    run.opportunityProfiles = {};
  }
  run.opportunityProfiles[opportunityId] = profile;
  run.markModified('opportunityProfiles');
  run.markModified('steps');
}

function applyCountyResults(run, step, parsed, candidates) {
  const opportunityId = idStr(step.opportunityId);
  const rows = Array.isArray(parsed?.counties) ? parsed.counties : [];
  const allowed = new Set((step.countyIds || []).map(String));

  for (const row of rows) {
    const countyId = String(row.countyId || '');
    if (!allowed.has(countyId)) continue;
    const countyData = candidates.byCountyId.get(countyId);
    if (!countyData) continue;

    const matchedCodes = [];
    const matchedEntries = [];
    for (const raw of Array.isArray(row.matchedCodes) ? row.matchedCodes : []) {
      const meta = lookupCodeMeta(countyData, raw);
      if (!meta) continue;
      matchedCodes.push(meta);
      if (meta.technical || meta.consultant || meta.technicalPriority != null) {
        matchedEntries.push(meta);
      } else {
        for (const plan of countyData.localPlans || []) {
          const entry = (plan.entries || []).find((item) => String(item.questionId) === meta.questionId);
          if (entry) matchedEntries.push({ ...meta, ...entry });
        }
      }
    }

    const primarySurvey = (countyData.surveys || [])[0];
    let gradeBefore = {
      letter: primarySurvey?.letter || '',
      percent: primarySurvey?.percent ?? null,
      total: primarySurvey?.total ?? null,
      maxTotal: primarySurvey?.maxTotal ?? null,
      byArea: primarySurvey?.byArea || {},
      surveyId: primarySurvey?.surveyId || '',
      surveyName: primarySurvey?.surveyName || '',
    };
    let gradeAfter = { ...gradeBefore };
    if (primarySurvey) {
      const simulated = simulateGrade(primarySurvey._versionItems, primarySurvey._answers, matchedCodes);
      gradeBefore = {
        ...gradeBefore,
        ...simulated.before,
        surveyId: primarySurvey.surveyId,
        surveyName: primarySurvey.surveyName,
      };
      gradeAfter = {
        ...simulated.after,
        surveyId: primarySurvey.surveyId,
        surveyName: primarySurvey.surveyName,
      };
    }

    const dimensions = buildDimensions({
      gradeBefore,
      gradeAfter,
      matchedEntries,
      population: countyData.population,
      gdp: countyData.gdp,
      maxGdp: candidates.maxGdp,
      risk: countyData.risk,
      aiDimensions: row.dimensions,
    });

    upsertMatch(run, {
      opportunityId,
      countyId,
      countyName: countyData.pack.name,
      IBGECode: countyData.pack.IBGECode,
      gradeBefore,
      gradeAfter,
      matchedCodes: matchedCodes
        .slice()
        .sort(
          (a, b) =>
            Number(b.technicalPriority || 0) +
            Number(b.governmentPriority || 0) -
            (Number(a.technicalPriority || 0) + Number(a.governmentPriority || 0))
        ),
      dimensions,
      overallScore: overallScore(dimensions),
      rationale: String(row.rationale || '').slice(0, 4000),
      projectId: findMatchRow(run, opportunityId, countyId)?.projectId || null,
    });
  }
}

async function finishSucceededStep(run, step, data, candidates) {
  const raw = data?.analysis?.result;
  step.rawResult = persistAnalysisResult(raw) || '';
  step.status = 'succeeded';
  step.error = '';
  try {
    const parsed = extractJson(raw);
    if (step.kind === 'profile') applyProfileResult(run, step, parsed);
    else applyCountyResults(run, step, parsed, candidates);
  } catch (error) {
    step.status = 'failed';
    step.error = error.message || 'Failed to parse analysis JSON.';
  }
  run.markModified('steps');
}

async function syncStepFromRtcnai(step, { queue } = {}) {
  if (TERMINAL.has(step.status) && (step.status === 'failed' || step.status === 'cancelled' || step.rawResult)) {
    return step.status;
  }
  if (!step.jobId && !step.storageKey) return step.status;

  const location = step.storageKey ? locationForStep(step) : null;
  const resolvedQueue = queue || (await getQueue());
  const queued = findQueueJob(resolvedQueue, {
    jobId: step.jobId,
    uri: location?.uri,
  });
  if (queued) {
    applyQueueItem(step, queued);
    return step.status;
  }
  if (!step.jobId) {
    step.status = 'failed';
    step.error = NOT_IN_QUEUE_MESSAGE;
    return step.status;
  }

  let statusView;
  try {
    statusView = await getAnalysisStatus(step.jobId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      step.status = 'failed';
      step.error = NOT_IN_QUEUE_MESSAGE;
      return step.status;
    }
    throw error;
  }

  const outcome = applyStatusView(step, statusView);
  if (outcome === 'succeeded' && !step.rawResult) {
    const full = await getAnalysis(step.jobId);
    return { outcome, full };
  }
  return step.status;
}

async function syncRun(run) {
  const candidates = await loadCandidateCounties().catch((error) => {
    if (run.candidateCount > 0 && !(error instanceof ValidationError)) throw error;
    if (error instanceof ValidationError && IN_FLIGHT.has(run.status)) throw error;
    return { counties: [], byCountyId: new Map(), maxGdp: 0 };
  });
  const prompts = await loadPromptMap();
  const queue = await getQueue();

  for (const step of run.steps || []) {
    if (!IN_FLIGHT.has(step.status) && step.status !== 'pending') continue;
    if (step.status === 'pending') continue;
    const synced = await syncStepFromRtcnai(step, { queue });
    if (synced && typeof synced === 'object' && synced.outcome === 'succeeded') {
      await finishSucceededStep(run, step, synced.full, candidates);
    }
  }

  await startNextPending(run, { candidates, prompts });
  run.status = deriveRunStatus(run);
  if (run.status === 'failed' && !run.error) {
    const failed = (run.steps || []).find((step) => step.status === 'failed');
    run.error = failed?.error || 'Opportunity match analysis failed.';
  }
  if (run.status === 'succeeded') run.error = '';
  run.markModified('steps');
  return run;
}

async function startMatchRun(body, user) {
  const mode = oneOf(body.mode || 'shallow', MATCH_MODES, 'mode');
  const opportunityIds = await assertOpportunityAccess(user, body.opportunityIds || body.opportunityId, 'WRITE');
  const candidates = await loadCandidateCounties();
  const batches = chunk(candidates.counties, COUNTY_BATCH_SIZE);
  const prompts = await loadPromptMap();
  const snapshot = {};
  if (mode === 'shallow') snapshot[PROMPT_KEYS.SHALLOW] = prompts[PROMPT_KEYS.SHALLOW];
  else {
    snapshot[PROMPT_KEYS.DEEP_PROFILE] = prompts[PROMPT_KEYS.DEEP_PROFILE];
    snapshot[PROMPT_KEYS.DEEP_COUNTIES] = prompts[PROMPT_KEYS.DEEP_COUNTIES];
  }

  const created = await OpportunityMatchRun.create({
    opportunityIds,
    mode,
    status: 'queued',
    promptSnapshot: snapshot,
    candidateCount: candidates.counties.length,
    steps: planSteps(mode, opportunityIds, batches),
    matches: [],
    createdBy: user._id,
  });

  await startNextPending(created, { candidates, prompts });
  created.status = deriveRunStatus(created);
  await created.save();
  await created.populate('createdBy', 'username email');
  await created.populate('opportunityIds', 'name');
  return serializeRun(created);
}

async function loadRun(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(400, 'Invalid run id.', { code: ERROR_CODES.VALIDATION });
  }
  const doc = await OpportunityMatchRun.findById(id)
    .populate('createdBy', 'username email')
    .populate('opportunityIds', 'name');
  if (!doc) {
    throw new HttpError(404, 'Match run not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  return doc;
}

async function getMatchRun(id, user) {
  const doc = await loadRun(id);
  await assertOpportunityAccess(user, doc.opportunityIds, 'READ');
  if (!TERMINAL.has(doc.status) || doc.steps.some((step) => IN_FLIGHT.has(step.status) || step.status === 'pending')) {
    await syncRun(doc);
    await doc.save();
  }
  return serializeRun(doc, { detailed: true });
}

async function cancelMatchRun(id, user) {
  const doc = await loadRun(id);
  await assertOpportunityAccess(user, doc.opportunityIds, 'WRITE');
  if (TERMINAL.has(doc.status) && doc.status !== 'queued') {
    if (doc.status === 'cancelled') return serializeRun(doc);
    throw new HttpError(409, 'Completed runs cannot be cancelled.', { code: ERROR_CODES.CONFLICT });
  }

  for (const step of doc.steps || []) {
    if (IN_FLIGHT.has(step.status) && step.jobId) {
      try {
        await cancelAnalysis(step.jobId);
      } catch (error) {
        if (!(error instanceof HttpError && (error.status === 404 || error.status === 409))) throw error;
      }
      step.status = 'cancelled';
      step.error = '';
    } else if (step.status === 'pending') {
      step.status = 'cancelled';
    }
  }
  doc.status = 'cancelled';
  doc.markModified('steps');
  await doc.save();
  return serializeRun(doc);
}

const MATCH_RUN_SORTABLE = new Set(['createdAt', 'updatedAt', 'mode', 'status', 'candidateCount']);

async function listMatchRuns(user, query = {}) {
  const isAdmin = await userIsAdminGroupMember(user);
  const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
    query,
    MATCH_RUN_SORTABLE,
    'createdAt'
  );

  const filter = {};
  const mode = String(query.mode || '').trim();
  if (mode && MATCH_MODES.includes(mode)) filter.mode = mode;
  const status = String(query.status || '').trim();
  if (status && RUN_STATUSES.includes(status)) filter.status = status;

  const q = String(query.q || query.search || '').trim();
  if (q) {
    const regex = { $regex: escapeRegex(q), $options: 'i' };
    const [opps, users] = await Promise.all([
      Opportunity.find(activeFilter({ name: regex })).select('_id'),
      User.find({ $or: [{ username: regex }, { email: regex }] }).select('_id'),
    ]);
    filter.$or = [
      { opportunityIds: { $in: opps.map((row) => row._id) } },
      { createdBy: { $in: users.map((row) => row._id) } },
    ];
  }

  const total = await OpportunityMatchRun.countDocuments(filter);
  const { page, skip } = clampPage(rawPage, total, limit);
  const runs = await OpportunityMatchRun.find(filter)
    .populate('createdBy', 'username email')
    .populate('opportunityIds', 'name')
    .sort({ [sortField]: sortOrder })
    .skip(skip)
    .limit(limit);

  const items = [];
  for (const run of runs) {
    if (!isAdmin) {
      try {
        await assertOpportunityAccess(user, run.opportunityIds, 'READ');
      } catch (error) {
        if (error instanceof HttpError && error.status === 403) continue;
        throw error;
      }
    }
    if (IN_FLIGHT.has(run.status) || (run.steps || []).some((step) => IN_FLIGHT.has(step.status))) {
      await syncRun(run);
      await run.save();
    }
    items.push(serializeRun(run));
  }

  return {
    ...paginatedResponse({ items, total, page, limit, sortField, orderLabel }),
    scoreWeights: SCORE_WEIGHTS,
  };
}

async function listOpportunityMatches(opportunityId, user) {
  const [id] = await assertOpportunityAccess(user, [opportunityId], 'READ');
  const runs = await OpportunityMatchRun.find({ opportunityIds: id })
    .populate('createdBy', 'username email')
    .sort({ createdAt: -1 })
    .limit(100);

  const latest = runs[0] || null;
  if (
    latest &&
    (!TERMINAL.has(latest.status) ||
      latest.steps.some((step) => IN_FLIGHT.has(step.status) || step.status === 'pending'))
  ) {
    await syncRun(latest);
    await latest.save();
  }

  return {
    latest: latest ? serializeRun(latest, { opportunityId: id }) : null,
    history: runs.map((row) => serializeRun(row, { opportunityId: id })),
    scoreWeights: SCORE_WEIGHTS,
  };
}

function findMatchRow(run, opportunityId, countyId) {
  return (run.matches || []).find(
    (row) => idStr(row.opportunityId) === String(opportunityId) && idStr(row.countyId) === String(countyId)
  );
}

async function createProjectFromMatch(opportunityId, runId, countyId, user) {
  await assertOpportunityAccess(user, [opportunityId], 'READ');
  const canCreate = await userHasPermission(user, 'PROJECT:CREATE');
  if (!canCreate) {
    throw new HttpError(403, 'Forbidden: Insufficient permissions for PROJECT:CREATE.', {
      code: ERROR_CODES.FORBIDDEN,
    });
  }

  const run = await loadRun(runId);
  if (!run.opportunityIds.map(idStr).includes(String(opportunityId))) {
    throw new HttpError(404, 'Match run not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  const match = findMatchRow(run, opportunityId, countyId);
  if (!match) {
    throw new HttpError(404, 'County match not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  if (match.projectId) {
    const existing = await Project.findById(match.projectId);
    if (existing) {
      return { project: existing.toObject(), reused: true };
    }
  }

  const { opportunity, record } = await loadOpportunityContext(opportunityId);
  const codes = (match.matchedCodes || []).map((row) => row.code).filter(Boolean).join(', ');
  const description = [
    match.rationale || `Project derived from opportunity–county match for ${match.countyName}.`,
    codes ? `Matched codes: ${codes}.` : '',
    match.gradeBefore?.letter
      ? `Estimated survey grade ${match.gradeBefore.letter} (${match.gradeBefore.percent}%) → ${match.gradeAfter?.letter || '—'} (${match.gradeAfter?.percent ?? '—'}%).`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const parsed = await parseProjectBody(
    {
      name: `${opportunity.name} · ${match.countyName}`.slice(0, 200),
      description: description.slice(0, 8000),
      opportunity: opportunityId,
      relatedEntity: { entityType: 'county', entityId: [countyId] },
      projWebsite: record.website,
      projStartDate: record.startDate,
      projEndDate: record.endDate || undefined,
      projBudget: record.budget,
      currency: record.currency,
      projStatus: 'draft',
      projComments: [
        `Overall match score: ${match.overallScore}`,
        `Run: ${String(run._id)}`,
      ],
      obs: `Created from opportunity match run ${String(run._id)}.`,
    },
    { partial: false }
  );

  const created = await Project.create({
    ...parsed,
    kind: 'PROJECT',
    assetType: ASSET_TYPE_LABELS.PROJECT,
    ownerId: user._id,
    createdBy: user._id,
    updatedBy: user._id,
  });
  match.projectId = created._id;
  run.markModified('matches');
  await run.save();
  return { project: created.toObject(), reused: false };
}

module.exports = {
  ensurePromptTemplates,
  listPromptTemplates,
  updatePromptTemplates,
  startMatchRun,
  getMatchRun,
  cancelMatchRun,
  listOpportunityMatches,
  listMatchRuns,
  createProjectFromMatch,
  serializeRun,
  serializePrompt,
};
