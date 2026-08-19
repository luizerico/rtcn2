const LocalPlan = require('../models/assets/LocalPlan');
const LocalPlanChange = require('../models/assets/LocalPlanChange');
const Survey = require('../models/assets/Survey');
const { InstrumentVersion, InstrumentResponse, InstrumentRevision } = require('../models/survey');
const County = require('../models/geo/County');
const {
  listAccessibleResources,
  userHasPermission,
  userIsAdminGroupMember,
} = require('./rbacService');
const { HttpError, ERROR_CODES } = require('../utils/httpErrors');
const { ValidationError, objectId, oneOf } = require('../validation');
const { activeFilter, applyTrash } = require('./trash');
const { parseListQuery, clampPage, textSearchOr } = require('../utils/listQuery');
const {
  INCLUSION_MODES,
  YES_NO,
  LEVELS,
  areaLabel,
  defaultTechnical,
  defaultConsultant,
  withPriorities,
} = require('../constants/localPlan');

function refId(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
}

function actorRef(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    return {
      _id: String(value._id || value.id || ''),
      username: value.username,
      email: value.email,
    };
  }
  return { _id: String(value) };
}

function itemKey(item) {
  return String(item.questionId || item._id || '');
}

function answerMap(answers) {
  const map = new Map();
  for (const row of answers || []) {
    const id = String(row.questionId || row.question || '');
    if (id) map.set(id, row);
  }
  return map;
}

function isGapItem(item, answersById) {
  if (String(item.type) !== 'score') return false;
  const raw = answersById.get(itemKey(item))?.value;
  const value = Number(raw);
  return !Number.isFinite(value) || value === 0;
}

function candidateItems(versionItems, answers, inclusionMode, questionIds) {
  const items = Array.isArray(versionItems) ? versionItems : [];
  const byId = answerMap(answers);
  if (inclusionMode === 'all') return items;
  if (inclusionMode === 'gaps') return items.filter((item) => isGapItem(item, byId));
  const selected = new Set((questionIds || []).map(String));
  const unknown = [...selected].filter((id) => !items.some((item) => itemKey(item) === id));
  if (unknown.length) {
    throw new ValidationError('One or more selected question ids are not on this survey version.');
  }
  return items.filter((item) => selected.has(itemKey(item)));
}

function plainEntry(existing) {
  if (!existing) return null;
  return typeof existing.toObject === 'function' ? existing.toObject() : { ...existing };
}

function buildEntry(item, existing) {
  const prior = plainEntry(existing);
  const base = prior
    ? {
        ...prior,
        questionId: itemKey(item),
        code: item.code || prior.code,
        area: item.area || prior.area || '',
        todo: item.todo || item.prompt || prior.todo || '',
      }
    : {
        questionId: itemKey(item),
        code: item.code || '',
        area: item.area || '',
        todo: item.todo || item.prompt || '',
        technical: defaultTechnical(),
        consultant: defaultConsultant(),
        isLocalAgenda: false,
      };
  return withPriorities(base);
}

function changeItem(entry) {
  return {
    questionId: String(entry.questionId),
    code: entry.code || '',
    area: entry.area || '',
  };
}

async function recordChange({ localPlanId, reason, sourceRevision, added, removed, userId }) {
  if (!added?.length && !removed?.length && reason !== 'set_default') return null;
  return LocalPlanChange.create({
    localPlanId,
    reason,
    sourceRevision: sourceRevision || null,
    added: added || [],
    removed: removed || [],
    createdBy: userId || null,
  });
}

async function loadSheetForPlan(instrumentResponseId) {
  const response = await InstrumentResponse.findOne(activeFilter({ _id: instrumentResponseId }));
  if (!response) {
    throw new HttpError(404, 'Survey answer not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  if (String(response.subjectType).toUpperCase() !== 'COUNTY') {
    throw new ValidationError('Local plans can only be created from county survey answers.');
  }
  if (response.status !== 'approved') {
    throw new ValidationError('Local plans can only be created from approved survey answers.');
  }
  const survey = await Survey.findOne(activeFilter({ _id: response.instrumentId }));
  if (!survey) {
    throw new HttpError(404, 'Survey not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  const assigned = (survey.countyIds || []).map(String);
  if (!assigned.includes(String(response.subjectId))) {
    throw new ValidationError('This county is not assigned to the survey.');
  }
  const version = await InstrumentVersion.findById(response.instrumentVersionId);
  if (!version) {
    throw new HttpError(404, 'Survey version not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  const county = await County.findOne({ _id: response.subjectId, isDeleted: { $ne: true } }).select(
    'name IBGECode'
  );
  if (!county) {
    throw new HttpError(404, 'County not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  return { response, survey, version, county };
}

async function answersForRevision(response, sourceRevision) {
  const revision = Number(sourceRevision);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new ValidationError('sourceRevision must be a positive integer.');
  }
  if (revision === (response.revision || 1)) {
    return { answers: response.answers || [], revision };
  }
  const snapshot = await InstrumentRevision.findOne({
    responseId: response._id,
    revision,
  }).lean();
  if (!snapshot) {
    throw new HttpError(404, 'Survey revision not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  const answers = snapshot.snapshot?.answers || [];
  return { answers, revision };
}

async function assertSurveyRead(user, survey) {
  if (await userIsAdminGroupMember(user)) return;
  const allowed = await userHasPermission(user, 'SURVEY:READ', { resourceId: String(survey._id) });
  if (!allowed) {
    throw new HttpError(403, 'Forbidden: Insufficient permissions for SURVEY:READ.', {
      code: ERROR_CODES.FORBIDDEN,
    });
  }
}

async function assertCountyRead(user, countyId) {
  if (await userIsAdminGroupMember(user)) return;
  const allowed = await userHasPermission(user, 'COUNTY:READ', { resourceId: String(countyId) });
  if (!allowed) {
    throw new HttpError(403, 'Forbidden: Insufficient permissions for COUNTY:READ.', {
      code: ERROR_CODES.FORBIDDEN,
    });
  }
}

async function canWritePlan(user, plan) {
  if (await userIsAdminGroupMember(user)) return true;
  return userHasPermission(user, 'LOCALPLAN:WRITE', { resourceId: String(plan._id) });
}

async function assertCanOpenPlan(user, plan) {
  await assertCountyRead(user, refId(plan.countyId));
  if (plan.status === 'default') return;
  if (await canWritePlan(user, plan)) return;
  throw new HttpError(403, 'Forbidden: Insufficient permissions to open this local plan draft.', {
    code: ERROR_CODES.FORBIDDEN,
  });
}

function serializeEntry(entry) {
  const obj = typeof entry.toObject === 'function' ? entry.toObject() : entry;
  return {
    questionId: String(obj.questionId),
    code: obj.code,
    area: obj.area || '',
    areaLabel: areaLabel(obj.area),
    todo: obj.todo || '',
    technical: obj.technical,
    consultant: obj.consultant,
    isLocalAgenda: Boolean(obj.isLocalAgenda),
    technicalPriority: obj.technicalPriority,
    governmentPriority: obj.governmentPriority,
  };
}

function serializePlan(doc, extras = {}) {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const county = obj.countyId && typeof obj.countyId === 'object' ? obj.countyId : null;
  const survey = obj.surveyId && typeof obj.surveyId === 'object' && obj.surveyId.name ? obj.surveyId : null;
  return {
    _id: String(obj._id),
    name: obj.name,
    description: obj.description || '',
    kind: 'LOCALPLAN',
    assetType: obj.assetType,
    status: obj.status,
    surveyId: String(survey?._id || obj.surveyId),
    surveyName: survey?.name || extras.surveyName || '',
    countyId: String(county?._id || obj.countyId),
    countyName: county?.name || extras.countyName || '',
    instrumentResponseId: String(obj.instrumentResponseId),
    instrumentVersionId: String(obj.instrumentVersionId),
    sourceRevision: obj.sourceRevision,
    inclusionMode: obj.inclusionMode,
    includedQuestionIds: obj.includedQuestionIds || [],
    entries: extras.summary ? undefined : (obj.entries || []).map(serializeEntry),
    entryCount: (obj.entries || []).length,
    obs: obj.obs || '',
    ownerId: actorRef(obj.ownerId),
    createdBy: actorRef(obj.createdBy),
    updatedBy: actorRef(obj.updatedBy),
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    canWrite: extras.canWrite === true,
    siblings: extras.siblings || undefined,
  };
}

async function populatePlan(id) {
  return LocalPlan.findOne(activeFilter({ _id: id }))
    .populate('countyId', 'name IBGECode')
    .populate('surveyId', 'name')
    .populate('ownerId', 'username email')
    .populate('createdBy', 'username email')
    .populate('updatedBy', 'username email');
}

async function listSiblings(plan, user) {
  if (!(await canWritePlan(user, plan))) return [];
  const rows = await LocalPlan.find(
    activeFilter({
      countyId: plan.countyId,
      surveyId: plan.surveyId,
      _id: { $ne: plan._id },
    })
  )
    .select('name status sourceRevision updatedAt')
    .sort({ updatedAt: -1 })
    .lean();
  return rows.map((row) => ({
    _id: String(row._id),
    name: row.name,
    status: row.status,
    sourceRevision: row.sourceRevision,
    updatedAt: row.updatedAt,
  }));
}

function previewPayload({ survey, county, response, version, revision, inclusionMode, items }) {
  const areas = [];
  const seen = new Set();
  for (const item of items) {
    const id = item.area || 'General';
    if (seen.has(id)) continue;
    seen.add(id);
    areas.push({ id, label: areaLabel(id) });
  }
  return {
    surveyId: String(survey._id),
    surveyName: survey.name,
    countyId: String(county._id),
    countyName: county.name,
    instrumentResponseId: String(response._id),
    instrumentVersionId: String(version._id),
    sourceRevision: revision,
    inclusionMode,
    areas,
    items: items.map((item) => ({
      questionId: itemKey(item),
      code: item.code,
      area: item.area || '',
      areaLabel: areaLabel(item.area),
      todo: item.todo || item.prompt || '',
      prompt: item.prompt,
      type: item.type,
    })),
  };
}

async function previewLocalPlan(query, user) {
  const responseId = objectId(query.instrumentResponseId, 'instrumentResponseId');
  const inclusionMode = oneOf(query.inclusionMode || 'gaps', INCLUSION_MODES, 'inclusionMode');
  const { response, survey, version, county } = await loadSheetForPlan(responseId);
  await assertSurveyRead(user, survey);
  await assertCountyRead(user, county._id);
  const requestedRevision =
    query.sourceRevision == null || query.sourceRevision === ''
      ? response.revision || 1
      : Number(query.sourceRevision);
  const { answers, revision } = await answersForRevision(response, requestedRevision);
  const questionIds = Array.isArray(query.questionIds)
    ? query.questionIds
    : typeof query.questionIds === 'string' && query.questionIds
      ? query.questionIds.split(',')
      : [];
  const items = candidateItems(version.items, answers, inclusionMode, questionIds);
  return previewPayload({
    survey,
    county,
    response,
    version,
    revision,
    inclusionMode,
    items,
  });
}

async function existingDefault(countyId, surveyId) {
  return LocalPlan.findOne(activeFilter({ countyId, surveyId, status: 'default' }));
}

async function createLocalPlan(body, user) {
  const responseId = objectId(body.instrumentResponseId, 'instrumentResponseId');
  const inclusionMode = oneOf(body.inclusionMode || 'gaps', INCLUSION_MODES, 'inclusionMode');
  const { response, survey, version, county } = await loadSheetForPlan(responseId);
  await assertSurveyRead(user, survey);
  await assertCountyRead(user, county._id);
  const requestedRevision =
    body.sourceRevision == null || body.sourceRevision === ''
      ? response.revision || 1
      : Number(body.sourceRevision);
  const { answers, revision } = await answersForRevision(response, requestedRevision);
  const questionIds = Array.isArray(body.questionIds) ? body.questionIds.map(String) : [];
  if (inclusionMode === 'selected' && !questionIds.length) {
    throw new ValidationError('Select at least one code to include.');
  }
  const items = candidateItems(version.items, answers, inclusionMode, questionIds);
  const entries = items.map((item) => buildEntry(item));
  const hasDefault = await existingDefault(county._id, survey._id);
  const status = hasDefault ? 'draft' : 'default';
  const name = String(body.name || '').trim() || `Local plan · ${county.name} · ${survey.name}`;
  const includedQuestionIds = inclusionMode === 'selected' ? items.map((item) => itemKey(item)) : [];

  const created = await LocalPlan.create({
    name,
    description: String(body.description || '').trim(),
    kind: 'LOCALPLAN',
    assetType: 'Local plan',
    surveyId: survey._id,
    instrumentResponseId: response._id,
    instrumentVersionId: version._id,
    countyId: county._id,
    sourceRevision: revision,
    inclusionMode,
    includedQuestionIds,
    status,
    entries,
    obs: String(body.obs || '').trim(),
    ownerId: user._id,
    createdBy: user._id,
    updatedBy: user._id,
  });
  await recordChange({
    localPlanId: created._id,
    reason: 'create',
    sourceRevision: revision,
    added: entries.map(changeItem),
    removed: [],
    userId: user._id,
  });
  const loaded = await populatePlan(created._id);
  return serializePlan(loaded, {
    canWrite: true,
    siblings: await listSiblings(loaded, user),
  });
}

async function localPlanAccessFilter(user) {
  if (await userIsAdminGroupMember(user)) {
    return { empty: false, clauses: [] };
  }
  const [planAccess, countyAccess, writeAccess] = await Promise.all([
    listAccessibleResources(user, 'LOCALPLAN:READ'),
    listAccessibleResources(user, 'COUNTY:READ'),
    listAccessibleResources(user, 'LOCALPLAN:WRITE'),
  ]);
  if (!planAccess.all && !planAccess.ids.length) return { empty: true, clauses: [] };
  if (!countyAccess.all && !countyAccess.ids.length) return { empty: true, clauses: [] };
  const clauses = [];
  if (!planAccess.all) clauses.push({ _id: { $in: planAccess.ids } });
  if (!countyAccess.all) clauses.push({ countyId: { $in: countyAccess.ids } });
  if (!writeAccess.all) {
    clauses.push(
      writeAccess.ids.length
        ? { $or: [{ status: 'default' }, { _id: { $in: writeAccess.ids } }] }
        : { status: 'default' }
    );
  }
  return { empty: false, clauses };
}

async function listLocalPlans(query, user) {
  const { page, limit, sortField, sortOrder, orderLabel } = parseListQuery(
    query,
    new Set(['name', 'status', 'updatedAt', 'createdAt', 'sourceRevision']),
    'updatedAt'
  );
  const access = await localPlanAccessFilter(user);
  const search = String(query.search || query.q || '').trim();
  if (access.empty) {
    return {
      items: [],
      page,
      limit,
      total: 0,
      totalPages: 0,
      sort: sortField,
      order: orderLabel,
      search,
    };
  }
  const filter = activeFilter();
  const extra = [...access.clauses];
  if (query.surveyId) extra.push({ surveyId: objectId(query.surveyId, 'surveyId') });
  if (query.countyId) extra.push({ countyId: objectId(query.countyId, 'countyId') });
  if (query.status) {
    extra.push({ status: oneOf(query.status, ['draft', 'default', 'archived'], 'status') });
  }
  const qOr = textSearchOr(['name', 'description'], search);
  if (qOr) extra.push({ $or: qOr });
  if (extra.length) filter.$and = extra;

  const total = await LocalPlan.countDocuments(filter);
  const { page: nextPage, totalPages, skip } = clampPage(page, total, limit);
  const docs = await LocalPlan.find(filter)
    .populate('countyId', 'name IBGECode')
    .populate('surveyId', 'name')
    .populate('ownerId', 'username email')
    .sort({ [sortField]: sortOrder })
    .skip(skip)
    .limit(limit);

  const items = [];
  for (const doc of docs) {
    items.push(serializePlan(doc, { canWrite: await canWritePlan(user, doc), summary: true }));
  }
  return {
    items,
    page: nextPage,
    limit,
    total,
    totalPages,
    sort: sortField,
    order: orderLabel,
    search,
  };
}

async function getLocalPlan(id, user) {
  const doc = await populatePlan(id);
  if (!doc) {
    throw new HttpError(404, 'Local plan not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  await assertCanOpenPlan(user, doc);
  return serializePlan(doc, {
    canWrite: await canWritePlan(user, doc),
    siblings: await listSiblings(doc, user),
  });
}

function patchTechnical(current, incoming) {
  const next = {
    opportunities: { ...(current.opportunities || defaultTechnical().opportunities) },
    complexity: { ...(current.complexity || defaultTechnical().complexity) },
    isMandatory: Boolean(current.isMandatory),
  };
  if (incoming.opportunities) {
    for (const key of ['federal', 'state', 'partners']) {
      if (incoming.opportunities[key] != null) {
        next.opportunities[key] = oneOf(incoming.opportunities[key], YES_NO, `opportunities.${key}`);
      }
    }
  }
  if (incoming.complexity) {
    for (const key of ['administrative', 'financial']) {
      if (incoming.complexity[key] != null) {
        next.complexity[key] = oneOf(incoming.complexity[key], LEVELS, `complexity.${key}`);
      }
    }
  }
  if (incoming.isMandatory != null) next.isMandatory = Boolean(incoming.isMandatory);
  return next;
}

function patchConsultant(current, incoming) {
  const next = { ...(current || defaultConsultant()) };
  for (const key of ['financialCapacity', 'planCapacity', 'interCooperation']) {
    if (incoming[key] != null) next[key] = oneOf(incoming[key], LEVELS, key);
  }
  return next;
}

async function updateLocalPlan(id, body, user) {
  const doc = await LocalPlan.findOne(activeFilter({ _id: id }));
  if (!doc) {
    throw new HttpError(404, 'Local plan not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  await assertCanOpenPlan(user, doc);
  if (!(await canWritePlan(user, doc))) {
    throw new HttpError(403, 'Forbidden: Insufficient permissions for LOCALPLAN:WRITE.', {
      code: ERROR_CODES.FORBIDDEN,
    });
  }
  if (body.name != null) doc.name = String(body.name).trim() || doc.name;
  if (body.description != null) doc.description = String(body.description).trim();
  if (body.obs != null) doc.obs = String(body.obs).trim();
  if (Array.isArray(body.entries)) {
    const byId = new Map((doc.entries || []).map((entry) => [String(entry.questionId), entry]));
    for (const patch of body.entries) {
      const questionId = String(patch.questionId || '');
      const current = byId.get(questionId);
      if (!current) {
        throw new ValidationError(`Unknown plan entry: ${questionId}`);
      }
      if (patch.technical) current.technical = patchTechnical(current.technical || {}, patch.technical);
      if (patch.consultant) {
        current.consultant = patchConsultant(current.consultant || {}, patch.consultant);
      }
      if (patch.isLocalAgenda != null) current.isLocalAgenda = Boolean(patch.isLocalAgenda);
      const next = withPriorities({
        questionId: current.questionId,
        code: current.code,
        area: current.area,
        todo: current.todo,
        technical: current.technical,
        consultant: current.consultant,
        isLocalAgenda: current.isLocalAgenda,
      });
      current.technical = next.technical;
      current.consultant = next.consultant;
      current.isLocalAgenda = next.isLocalAgenda;
      current.technicalPriority = next.technicalPriority;
      current.governmentPriority = next.governmentPriority;
    }
    doc.markModified('entries');
  }
  doc.updatedBy = user._id;
  await doc.save();
  const loaded = await populatePlan(doc._id);
  return serializePlan(loaded, {
    canWrite: true,
    siblings: await listSiblings(loaded, user),
  });
}

async function setDefaultLocalPlan(id, user) {
  const doc = await LocalPlan.findOne(activeFilter({ _id: id }));
  if (!doc) {
    throw new HttpError(404, 'Local plan not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  await assertCanOpenPlan(user, doc);
  if (!(await canWritePlan(user, doc))) {
    throw new HttpError(403, 'Forbidden: Insufficient permissions for LOCALPLAN:WRITE.', {
      code: ERROR_CODES.FORBIDDEN,
    });
  }
  if (doc.status === 'archived') {
    throw new ValidationError('Archived local plans cannot be marked as default.');
  }
  await LocalPlan.updateMany(
    activeFilter({
      countyId: doc.countyId,
      surveyId: doc.surveyId,
      status: 'default',
      _id: { $ne: doc._id },
    }),
    { $set: { status: 'draft', updatedBy: user._id } }
  );
  doc.status = 'default';
  doc.updatedBy = user._id;
  await doc.save();
  await recordChange({
    localPlanId: doc._id,
    reason: 'set_default',
    sourceRevision: doc.sourceRevision,
    added: [],
    removed: [],
    userId: user._id,
  });
  const loaded = await populatePlan(doc._id);
  return serializePlan(loaded, {
    canWrite: true,
    siblings: await listSiblings(loaded, user),
  });
}

async function deleteLocalPlan(id, user) {
  const doc = await LocalPlan.findOne(activeFilter({ _id: id }));
  if (!doc) {
    throw new HttpError(404, 'Local plan not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  await assertCountyRead(user, refId(doc.countyId));
  applyTrash(doc, user._id);
  await doc.save();
  return { message: 'Local plan moved to recycle bin.', _id: String(doc._id) };
}

async function listLocalPlanChanges(id, user) {
  const doc = await LocalPlan.findOne(activeFilter({ _id: id }));
  if (!doc) {
    throw new HttpError(404, 'Local plan not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  await assertCanOpenPlan(user, doc);
  const rows = await LocalPlanChange.find({ localPlanId: doc._id })
    .populate('createdBy', 'username email')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  return {
    items: rows.map((row) => ({
      _id: String(row._id),
      reason: row.reason,
      sourceRevision: row.sourceRevision,
      added: row.added || [],
      removed: row.removed || [],
      createdBy: actorRef(row.createdBy),
      createdAt: row.createdAt,
    })),
  };
}

async function listLocalPlanLinksForSurvey(surveyId) {
  const items = await LocalPlan.find(activeFilter({ surveyId }))
    .select('name status countyId sourceRevision')
    .populate('countyId', 'name')
    .sort({ updatedAt: -1 })
    .lean();
  return {
    count: items.length,
    items: items.map((row) => ({
      _id: String(row._id),
      name: row.name,
      status: row.status,
      countyId: String(row.countyId?._id || row.countyId),
      countyName: row.countyId?.name || '',
      sourceRevision: row.sourceRevision,
    })),
  };
}

async function assertSurveyPurgeAllowed(surveyId) {
  const count = await LocalPlan.countDocuments({ surveyId });
  if (count > 0) {
    throw new HttpError(
      409,
      `Cannot permanently delete this survey while ${count} linked local plan(s) exist.`,
      { code: ERROR_CODES.CONFLICT, details: { localPlanCount: count } }
    );
  }
}

function desiredItemsForPlan(plan, versionItems, answers) {
  if (plan.inclusionMode === 'selected') {
    const selected = new Set((plan.includedQuestionIds || []).map(String));
    return versionItems.filter((item) => selected.has(itemKey(item)));
  }
  return candidateItems(versionItems, answers, plan.inclusionMode, plan.includedQuestionIds);
}

async function syncDefaultLocalPlanForResponse(response, userId) {
  if (!response || response.status !== 'approved') return null;
  if (String(response.subjectType).toUpperCase() !== 'COUNTY') return null;

  const plan = await LocalPlan.findOne(
    activeFilter({
      instrumentResponseId: response._id,
      status: 'default',
    })
  );
  if (!plan) return null;

  const version = await InstrumentVersion.findById(
    plan.instrumentVersionId || response.instrumentVersionId
  );
  if (!version) return null;

  const previous = new Map((plan.entries || []).map((entry) => [String(entry.questionId), entry]));
  const desired = desiredItemsForPlan(plan, version.items || [], response.answers || []);
  const desiredIds = new Set(desired.map(itemKey));
  const nextEntries = desired.map((item) => buildEntry(item, previous.get(itemKey(item))));
  const added = nextEntries
    .filter((entry) => !previous.has(String(entry.questionId)))
    .map(changeItem);
  const removed = [...previous.values()]
    .filter((entry) => !desiredIds.has(String(entry.questionId)))
    .map(changeItem);

  if (!added.length && !removed.length && plan.sourceRevision === (response.revision || 1)) {
    return null;
  }

  plan.entries = nextEntries;
  plan.sourceRevision = response.revision || plan.sourceRevision;
  plan.updatedBy = userId || plan.updatedBy;
  await plan.save();
  await recordChange({
    localPlanId: plan._id,
    reason: 'survey_revision',
    sourceRevision: plan.sourceRevision,
    added,
    removed,
    userId,
  });
  return { added: added.length, removed: removed.length, localPlanId: String(plan._id) };
}

module.exports = {
  previewLocalPlan,
  createLocalPlan,
  listLocalPlans,
  getLocalPlan,
  updateLocalPlan,
  setDefaultLocalPlan,
  deleteLocalPlan,
  listLocalPlanChanges,
  listLocalPlanLinksForSurvey,
  assertSurveyPurgeAllowed,
  syncDefaultLocalPlanForResponse,
  buildEntry,
  candidateItems,
  isGapItem,
};
