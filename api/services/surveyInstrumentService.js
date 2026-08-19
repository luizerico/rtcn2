const crypto = require('crypto');
const mongoose = require('mongoose');
const Survey = require('../models/assets/Survey');
const { InstrumentVersion, InstrumentResponse, InstrumentRevision } = require('../models/survey');
const { County, Region, State, MicroRegion, Biome } = require('../models/geo');
const Project = require('../models/assets/Project');
const Opportunity = require('../models/assets/Opportunity');
const Sponsor = require('../models/assets/Sponsor');
const {
  QUESTION_TYPES,
  INSTRUMENT_TYPES,
  INSTRUMENT_STATUSES,
  RESPONSE_STATUSES,
  SUBJECT_TYPES,
} = require('../constants/assetTypes');
const { listAccessibleResources, userHasPermission, userIsAdminGroupMember } = require('./rbacService');
const { HttpError, ERROR_CODES } = require('../utils/httpErrors');
const { ValidationError, objectId, oneOf } = require('../validation');
const { activeFilter, trashedFilter, applyTrash, clearTrash } = require('./trash');
const { parseListQuery, clampPage, paginatedResponse, textSearchOr } = require('../utils/listQuery');

const OWNER_EDITABLE_STATUSES = ['in_progress', 'need_changes'];
const STARTER_STATUSES = ['in_progress', 'approved'];

const SUBJECT_MODELS = {
  COUNTY: () => County,
  PROJECT: () => Project,
  OPPORTUNITY: () => Opportunity,
  SPONSOR: () => Sponsor,
};

function letterGrade(percent) {
  if (percent >= 80) return 'A';
  if (percent >= 60) return 'B';
  if (percent >= 40) return 'C';
  if (percent >= 20) return 'D';
  return 'E';
}

function computeScore(items, answers) {
  const byId = new Map((answers || []).map((row) => [String(row.questionId), row]));
  const byArea = {};
  let total = 0;
  let maxTotal = 0;

  for (const item of items || []) {
    if (item.type !== 'score') continue;
    const maxPoints = Number(item.maxPoints) || 0;
    const weight = Number(item.weight) || 0;
    const cap = maxPoints * weight;
    maxTotal += cap;
    const raw = byId.get(String(item.questionId))?.value;
    const value = Number(raw);
    const clamped = Number.isFinite(value) ? Math.min(maxPoints, Math.max(0, value)) : 0;
    const earned = clamped * weight;
    total += earned;
    const area = item.area || '—';
    if (!byArea[area]) byArea[area] = { total: 0, maxTotal: 0 };
    byArea[area].total += earned;
    byArea[area].maxTotal += cap;
  }

  const percent = maxTotal > 0 ? Math.round((total / maxTotal) * 1000) / 10 : 0;
  return {
    total,
    maxTotal,
    percent,
    letter: maxTotal > 0 ? letterGrade(percent) : '',
    byArea,
  };
}

function snapshotQuestion(doc, sortOrder) {
  return {
    questionId: doc._id,
    code: doc.code,
    area: doc.area || '',
    prompt: doc.prompt,
    type: doc.type,
    options: doc.options || [],
    required: doc.required !== false,
    evidence: doc.evidence || '',
    criteria: doc.criteria || '',
    maxPoints: doc.maxPoints || 0,
    weight: doc.weight == null ? 1 : doc.weight,
    todo: doc.todo || '',
    questionRevision: doc.revision || 1,
    sortOrder,
  };
}

function serializeQuestion(doc) {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: String(obj._id),
    questionId: String(obj._id),
    code: obj.code,
    area: obj.area || '',
    prompt: obj.prompt,
    type: obj.type,
    options: obj.options || [],
    required: obj.required !== false,
    evidence: obj.evidence || '',
    criteria: obj.criteria || '',
    maxPoints: obj.maxPoints || 0,
    weight: obj.weight == null ? 1 : obj.weight,
    todo: obj.todo || '',
    revision: obj.revision || 1,
  };
}

const QUESTION_CONTENT_KEYS = [
  'code',
  'area',
  'prompt',
  'type',
  'options',
  'required',
  'evidence',
  'criteria',
  'maxPoints',
  'weight',
  'todo',
];

function questionFingerprint(data) {
  return JSON.stringify(
    QUESTION_CONTENT_KEYS.map((key) => (key === 'options' ? data[key] || [] : data[key]))
  );
}

function serializeVersionItem(item) {
  return {
    questionId: String(item.questionId),
    code: item.code,
    area: item.area || '',
    prompt: item.prompt,
    type: item.type,
    options: item.options || [],
    required: item.required !== false,
    evidence: item.evidence || '',
    criteria: item.criteria || '',
    maxPoints: item.maxPoints || 0,
    weight: item.weight == null ? 1 : item.weight,
    todo: item.todo || '',
    questionRevision: item.questionRevision || 1,
    sortOrder: item.sortOrder || 0,
  };
}

function embeddedQuestions(survey) {
  return (survey.questions || []).map((doc, index) => ({
    ...serializeQuestion(doc),
    sortOrder: index,
  }));
}

async function loadPublishedVersion(survey) {
  if (!survey.currentVersionId) {
    return { version: survey.currentVersion || null, versionId: null, questions: [] };
  }
  const version = await InstrumentVersion.findById(survey.currentVersionId);
  if (!version) {
    return { version: survey.currentVersion || null, versionId: null, questions: [] };
  }
  return {
    version: version.version,
    versionId: String(version._id),
    questions: (version.items || []).map(serializeVersionItem),
  };
}

function serializeInstrument(survey, { includeQuestions = true } = {}) {
  const plain = typeof survey.toObject === 'function' ? survey.toObject() : { ...survey };
  const questions = includeQuestions ? embeddedQuestions(plain) : [];
  const {
    questions: _embedded,
    questionIds: _legacyIds,
    ...rest
  } = plain;
  return {
    ...rest,
    _id: String(plain._id),
    instrumentType: plain.instrumentType || 'poll',
    status: plain.status || 'draft',
    currentVersionId: plain.currentVersionId ? String(plain.currentVersionId) : null,
    currentVersion: plain.currentVersion || null,
    countyIds: (plain.countyIds || []).map(String),
    countyVersions: (plain.countyVersions || [])
      .filter((row) => row?.countyId && row?.versionId)
      .map((row) => ({
        countyId: String(row.countyId),
        versionId: String(row.versionId),
      })),
    questionCount:
      includeQuestions
        ? questions.length
        : Number.isFinite(plain.questionCount)
          ? plain.questionCount
          : questions.length,
    ...(includeQuestions ? { questions } : {}),
  };
}

async function listInstrumentVersionSummaries(survey) {
  const rows = await InstrumentVersion.find({ instrumentId: survey._id })
    .select('version publishedAt')
    .sort({ version: -1 })
    .lean();
  const activeId = survey.currentVersionId ? String(survey.currentVersionId) : '';
  return rows.map((row) => ({
    _id: String(row._id),
    version: row.version,
    publishedAt: row.publishedAt,
    active: String(row._id) === activeId,
  }));
}

async function serializeInstrumentDetail(survey) {
  const [published, versions] = await Promise.all([
    loadPublishedVersion(survey),
    listInstrumentVersionSummaries(survey),
  ]);
  return {
    ...serializeInstrument(survey, { includeQuestions: true }),
    currentVersion: published.version,
    currentVersionId: published.versionId || (survey.currentVersionId ? String(survey.currentVersionId) : null),
    publishedQuestions: published.questions,
    versions,
  };
}

function normalizeQuestionInput(body, { partial = false } = {}) {
  const data = {};
  if (!partial || body.code !== undefined) {
    const code = String(body.code || '').trim();
    if (!code) throw new ValidationError('Question code is required.');
    data.code = code;
  }
  if (!partial || body.prompt !== undefined) {
    const prompt = String(body.prompt || '').trim();
    if (!prompt) throw new ValidationError('Question prompt is required.');
    data.prompt = prompt;
  }
  if (!partial || body.type !== undefined) {
    const type = String(body.type || '').trim().toLowerCase();
    if (!QUESTION_TYPES.includes(type)) {
      throw new ValidationError(`Question type must be one of: ${QUESTION_TYPES.join(', ')}.`);
    }
    data.type = type;
  }
  if (!partial || body.area !== undefined) data.area = String(body.area || '').trim();
  if (!partial || body.options !== undefined) {
    data.options = Array.isArray(body.options)
      ? body.options.map((opt) => String(opt).trim()).filter(Boolean)
      : [];
  }
  if (!partial || body.required !== undefined) data.required = body.required !== false;
  if (!partial || body.evidence !== undefined) data.evidence = String(body.evidence || '').trim();
  if (!partial || body.criteria !== undefined) data.criteria = String(body.criteria || '').trim();
  if (!partial || body.maxPoints !== undefined) data.maxPoints = Number(body.maxPoints) || 0;
  if (!partial || body.weight !== undefined) {
    data.weight = body.weight == null || body.weight === '' ? 1 : Number(body.weight);
  }
  if (!partial || body.todo !== undefined) data.todo = String(body.todo || '').trim();

  const type = data.type;
  if (type === 'multiple_choice' && (data.options || []).length < 2) {
    throw new ValidationError('Multiple choice questions need at least two options.');
  }
  if (type === 'yes_no') data.options = ['Yes', 'No'];
  if (type === 'text') data.options = [];
  if (type === 'score' && data.maxPoints === 0) data.maxPoints = 2;
  return data;
}

function normalizeCountyIds(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ValidationError('countyIds must be an array of county ids.');
  }
  const ids = [];
  for (const raw of value) {
    const id = String(raw || '').trim();
    if (!id) continue;
    if (!mongoose.isValidObjectId(id)) {
      throw new ValidationError('Invalid county id in countyIds.');
    }
    ids.push(id);
  }
  return [...new Set(ids)];
}

function resolveQuestionObjectId(item) {
  const raw = item?._id || item?.questionId;
  if (raw && mongoose.isValidObjectId(raw)) {
    return new mongoose.Types.ObjectId(String(raw));
  }
  return new mongoose.Types.ObjectId();
}

function buildEmbeddedQuestions(rawQuestions, userId, instrumentType, existingQuestions = []) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new ValidationError('At least one question is required.');
  }
  const existingById = new Map(
    (existingQuestions || []).map((doc) => [String(doc._id), doc])
  );
  const seenCodes = new Set();
  const built = [];

  for (const [index, item] of rawQuestions.entries()) {
    const existingId = item?._id || item?.questionId;
    const existing = existingId ? existingById.get(String(existingId)) : null;
    const type =
      item?.type || existing?.type || (instrumentType === 'scored_diagnostic' ? 'score' : 'text');
    const code = String(
      item?.code || existing?.code || `Q${index + 1}-${crypto.randomBytes(3).toString('hex')}`
    ).trim();
    const codeKey = code.toLowerCase();
    if (seenCodes.has(codeKey)) {
      throw new ValidationError(`Duplicate question code: ${code}`);
    }
    seenCodes.add(codeKey);

    const data = normalizeQuestionInput({
      ...(existing ? serializeQuestion(existing) : {}),
      ...item,
      type,
      code,
      prompt: item?.prompt || item?.question || existing?.prompt,
    });

    const previous = existing ? serializeQuestion(existing) : null;
    const unchanged =
      previous && questionFingerprint(previous) === questionFingerprint({ ...previous, ...data });
    const revision = previous ? (unchanged ? existing.revision || 1 : (existing.revision || 1) + 1) : 1;

    built.push({
      _id: resolveQuestionObjectId(item),
      ...data,
      revision,
      createdBy: existing?.createdBy || userId,
      updatedBy: userId,
      createdAt: existing?.createdAt,
      updatedAt: new Date(),
    });
  }

  return built;
}

async function publishInstrument(survey, userId) {
  const docs = survey.questions || [];
  if (!docs.length) throw new ValidationError('Cannot publish an instrument with no questions.');
  const items = docs.map((doc, index) => snapshotQuestion(doc, index));
  const last = await InstrumentVersion.findOne({ instrumentId: survey._id }).sort({ version: -1 });
  const version = (last?.version || 0) + 1;
  const published = await InstrumentVersion.create({
    instrumentId: survey._id,
    version,
    items,
    publishedAt: new Date(),
    publishedBy: userId,
  });
  survey.currentVersionId = published._id;
  survey.currentVersion = published.version;
  survey.status = 'active';
  survey.updatedBy = userId;
  await survey.save();
  return published;
}

async function setActiveInstrumentVersion(survey, body, userId) {
  const version = await findPublishedVersion(survey, body);
  survey.currentVersionId = version._id;
  survey.currentVersion = version.version;
  survey.updatedBy = userId;
  await survey.save();
  return serializeInstrumentDetail(survey);
}

function countyVersionMap(survey) {
  const map = new Map();
  for (const row of survey.countyVersions || []) {
    const countyId = row?.countyId ? String(row.countyId) : '';
    const versionId = row?.versionId ? String(row.versionId) : '';
    if (countyId && versionId && !map.has(countyId)) map.set(countyId, versionId);
  }
  return map;
}

function defaultCountyVersionId(survey) {
  return survey.currentVersionId ? String(survey.currentVersionId) : null;
}

function resolveCountyVersionId(survey, countyId) {
  return countyVersionMap(survey).get(String(countyId)) || defaultCountyVersionId(survey);
}

async function findPublishedVersion(survey, body = {}) {
  const versionId = String(body?.versionId || body?.currentVersionId || '').trim();
  const versionNumber = body?.version == null || body?.version === '' ? null : Number(body.version);
  let version = null;
  if (versionId) {
    if (!mongoose.isValidObjectId(versionId)) {
      throw new ValidationError('Invalid version id.');
    }
    version = await InstrumentVersion.findOne({ _id: versionId, instrumentId: survey._id });
  } else if (Number.isInteger(versionNumber) && versionNumber >= 1) {
    version = await InstrumentVersion.findOne({ instrumentId: survey._id, version: versionNumber });
  } else {
    throw new ValidationError('versionId or version is required.');
  }
  if (!version) {
    throw new HttpError(404, 'Instrument version not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  return version;
}

function setCountyVersionRows(survey, rows) {
  const seen = new Set();
  const countyVersions = [];
  const countyIds = [];
  for (const row of rows) {
    const countyId = String(row.countyId);
    if (seen.has(countyId)) {
      throw new ValidationError('A county can only be assigned one version of this instrument.');
    }
    seen.add(countyId);
    countyIds.push(countyId);
    countyVersions.push({ countyId, versionId: row.versionId });
  }
  survey.countyIds = countyIds;
  survey.countyVersions = countyVersions;
  survey.markModified('countyVersions');
}

async function buildCountyVersionRows(survey, countyIds, { newVersionId = null } = {}) {
  const previous = new Set((survey.countyIds || []).map(String));
  const existing = countyVersionMap(survey);
  const fallback = newVersionId || defaultCountyVersionId(survey);
  const sheets = countyIds.length
    ? await InstrumentResponse.find(
        activeFilter({
          instrumentId: survey._id,
          subjectType: 'COUNTY',
          subjectId: { $in: countyIds },
        })
      ).select('subjectId instrumentVersionId')
    : [];
  const sheetVersion = new Map(
    sheets.map((row) => [String(row.subjectId), String(row.instrumentVersionId)])
  );

  const rows = [];
  for (const id of countyIds) {
    const key = String(id);
    const locked = sheetVersion.get(key);
    if (locked) {
      if (newVersionId && !previous.has(key) && newVersionId !== locked) {
        throw new ValidationError('This county already has a sheet on another version.');
      }
      rows.push({ countyId: key, versionId: locked });
      continue;
    }
    const versionId = previous.has(key) ? existing.get(key) || fallback : fallback;
    if (!versionId) {
      throw new ValidationError('Publish a version before assigning counties.');
    }
    rows.push({ countyId: key, versionId });
  }
  return rows;
}

async function setCountyInstrumentVersion(survey, countyId, body, userId) {
  if (!mongoose.isValidObjectId(countyId)) {
    throw new ValidationError('Invalid county id.');
  }
  const assigned = (survey.countyIds || []).map(String);
  if (!assigned.includes(String(countyId))) {
    throw new ValidationError('County is not assigned to this instrument.');
  }
  const version = await findPublishedVersion(survey, body);
  const existingSheet = await InstrumentResponse.findOne(
    activeFilter({
      instrumentId: survey._id,
      subjectType: 'COUNTY',
      subjectId: countyId,
    })
  ).select('instrumentVersionId');
  if (existingSheet && String(existingSheet.instrumentVersionId) !== String(version._id)) {
    throw new ValidationError(
      'This county already has a sheet on another version. A county can only use one version.'
    );
  }
  const rows = assigned.map((id) => ({
    countyId: id,
    versionId: String(id) === String(countyId) ? String(version._id) : resolveCountyVersionId(survey, id),
  }));
  if (rows.some((row) => !row.versionId)) {
    throw new ValidationError('Publish a version before assigning counties.');
  }
  setCountyVersionRows(survey, rows);
  survey.updatedBy = userId;
  await survey.save();
  return serializeInstrument(survey);
}

async function createInstrument(body, userId) {
  const name = String(body.name || '').trim();
  if (!name) throw new ValidationError('Survey name is required.');
  const instrumentType = INSTRUMENT_TYPES.includes(body.instrumentType)
    ? body.instrumentType
    : 'poll';

  const questions = buildEmbeddedQuestions(body.questions, userId, instrumentType);
  const countyIds = normalizeCountyIds(body.countyIds) || [];

  const survey = await Survey.create({
    name,
    description: body.description || '',
    kind: 'SURVEY',
    assetType: 'Survey',
    instrumentType,
    status: 'draft',
    questions,
    questionCount: questions.length,
    countyIds,
    ownerId: userId,
    createdBy: userId,
    updatedBy: userId,
  });

  await publishInstrument(survey, userId);
  return serializeInstrumentDetail(await Survey.findById(survey._id));
}

async function updateInstrument(survey, body, userId) {
  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) throw new ValidationError('Survey name is required.');
    survey.name = name;
  }
  if (body.description !== undefined) survey.description = body.description || '';
  if (body.status !== undefined) {
    if (!INSTRUMENT_STATUSES.includes(body.status)) {
      throw new ValidationError(`Invalid status. Use: ${INSTRUMENT_STATUSES.join(', ')}.`);
    }
    survey.status = body.status;
  }
  if (body.instrumentType !== undefined) {
    if (!INSTRUMENT_TYPES.includes(body.instrumentType)) {
      throw new ValidationError(`Invalid instrument type. Use: ${INSTRUMENT_TYPES.join(', ')}.`);
    }
    survey.instrumentType = body.instrumentType;
  }
  if (Array.isArray(body.questions)) {
    survey.questions = buildEmbeddedQuestions(
      body.questions,
      userId,
      survey.instrumentType,
      survey.questions
    );
    survey.markModified('questions');
  }
  if (body.countyIds !== undefined) {
    survey.countyIds = normalizeCountyIds(body.countyIds);
  }
  survey.updatedBy = userId;
  await survey.save();
  return serializeInstrumentDetail(survey);
}

/** Assignment list only — never publishes a new instrument version. */
async function updateInstrumentCounties(survey, body, userId) {
  const countyIds = normalizeCountyIds(body?.countyIds);
  if (countyIds === undefined) {
    throw new ValidationError('countyIds must be an array of county ids.');
  }
  let newVersionId = null;
  if (body?.versionId || body?.version) {
    newVersionId = String((await findPublishedVersion(survey, body))._id);
  }
  setCountyVersionRows(survey, await buildCountyVersionRows(survey, countyIds, { newVersionId }));
  survey.updatedBy = userId;
  await survey.save();
  return serializeInstrument(survey);
}

const COUNTY_SORT_FIELDS = new Set([
  'name',
  'code',
  'IBGECode',
  'state',
  'region',
  'biome',
  'microregion',
]);
const COUNTY_POPULATE = [
  { path: 'region', select: 'code name' },
  { path: 'state', select: 'code name' },
  { path: 'microregion', select: 'code name' },
  { path: 'biome', select: 'code name' },
];
const GEO_NAME_SORT = {
  state: { from: 'states', localField: 'state' },
  region: { from: 'regions', localField: 'region' },
  biome: { from: 'biomes', localField: 'biome' },
  microregion: { from: 'microregions', localField: 'microregion' },
};
const GEO_ASSIGN_TYPES = {
  region: { field: 'region', Model: Region, label: 'Region' },
  state: { field: 'state', Model: State, label: 'State' },
  biome: { field: 'biome', Model: Biome, label: 'Biome' },
  microregion: { field: 'microregion', Model: MicroRegion, label: 'Microregion' },
  county: { field: '_id', Model: County, label: 'County' },
};

function optionalObjectId(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return objectId(value, label);
}

function assignedCountyObjectIds(ids) {
  return ids
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

async function findAssignedCountyPage(filter, { sortField, sortOrder, skip, limit }) {
  const geoSort = GEO_NAME_SORT[sortField];
  if (!geoSort) {
    return County.find(filter)
      .populate(COUNTY_POPULATE)
      .sort({ [sortField]: sortOrder, _id: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  const pageIds = await County.aggregate([
    { $match: filter },
    {
      $lookup: {
        from: geoSort.from,
        localField: geoSort.localField,
        foreignField: '_id',
        as: '_sortGeo',
      },
    },
    { $unwind: { path: '$_sortGeo', preserveNullAndEmptyArrays: true } },
    { $sort: { '_sortGeo.name': sortOrder, name: sortOrder, _id: sortOrder } },
    { $skip: skip },
    { $limit: limit },
    { $project: { _id: 1 } },
  ]);
  const ids = pageIds.map((row) => row._id);
  if (!ids.length) return [];
  const found = await County.find({ _id: { $in: ids } })
    .populate(COUNTY_POPULATE)
    .lean();
  const byId = new Map(found.map((row) => [String(row._id), row]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

/** Live COUNTY sheets plus explicit countyIds (import/unassign can leave those out of sync). */
async function effectiveAssignedCountyIds(survey) {
  const fromAssignment = (survey.countyIds || []).map(String);
  const fromSheets = await InstrumentResponse.find(
    activeFilter({
      instrumentId: survey._id,
      subjectType: 'COUNTY',
    })
  ).distinct('subjectId');
  return [...new Set([...fromAssignment, ...fromSheets.map(String)])];
}

async function listAssignedInstrumentCounties(survey, query = {}) {
  const assigned = await effectiveAssignedCountyIds(survey);
  const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
    { ...query, order: query.order || 'asc' },
    COUNTY_SORT_FIELDS,
    'name'
  );

  if (!assigned.length) {
    return paginatedResponse({
      items: [],
      total: 0,
      page: 1,
      limit,
      sortField,
      orderLabel,
    });
  }

  const filter = { _id: { $in: assignedCountyObjectIds(assigned) }, isDeleted: { $ne: true } };
  const qOr = textSearchOr(['name', 'code', 'IBGECode'], query.search || query.q);
  if (qOr) filter.$or = qOr;

  const regionId = optionalObjectId(query.regionId, 'regionId');
  const stateId = optionalObjectId(query.stateId, 'stateId');
  const microregionId = optionalObjectId(query.microregionId, 'microregionId');
  const biomeId = optionalObjectId(query.biomeId, 'biomeId');
  if (regionId) filter.region = regionId;
  if (stateId) filter.state = stateId;
  if (microregionId) filter.microregion = microregionId;
  if (biomeId) filter.biome = biomeId;

  const total = await County.countDocuments(filter);
  const { page, skip } = clampPage(rawPage, total, limit);
  const items = total
    ? await findAssignedCountyPage(filter, { sortField, sortOrder, skip, limit })
    : [];

  const pageIds = items.map((row) => row._id);
  const [versionDocs, sheets] = await Promise.all([
    InstrumentVersion.find({ instrumentId: survey._id }).select('version').lean(),
    pageIds.length
      ? InstrumentResponse.find(
          activeFilter({
            instrumentId: survey._id,
            subjectType: 'COUNTY',
            subjectId: { $in: pageIds },
          })
        ).select('subjectId instrumentVersionId')
      : [],
  ]);
  const versionNumberById = new Map(versionDocs.map((row) => [String(row._id), row.version]));
  const sheetVersion = new Map(
    sheets.map((row) => [String(row.subjectId), String(row.instrumentVersionId)])
  );
  const assignedVersions = countyVersionMap(survey);
  const fallbackVersionId = defaultCountyVersionId(survey);

  return paginatedResponse({
    items: items.map((row) => {
      const id = String(row._id);
      const versionId = sheetVersion.get(id) || assignedVersions.get(id) || fallbackVersionId;
      return {
        ...row,
        _id: id,
        versionId,
        version: versionId ? versionNumberById.get(versionId) || null : null,
        versionLocked: sheetVersion.has(id),
      };
    }),
    total,
    page,
    limit,
    sortField,
    orderLabel,
  });
}

async function resolveBulkCountyChange(survey, body) {
  const action = oneOf(body?.action, ['assign', 'unassign'], 'action');
  const geoType = oneOf(body?.geoType, Object.keys(GEO_ASSIGN_TYPES), 'geoType');
  const geoId = objectId(body?.geoId, 'geoId');
  const spec = GEO_ASSIGN_TYPES[geoType];
  const geo = await spec.Model.findOne({ _id: geoId, isDeleted: { $ne: true } }).select('_id');
  if (!geo) {
    throw new HttpError(404, `${spec.label} not found.`, { code: ERROR_CODES.NOT_FOUND });
  }

  const matched = await County.find({
    [spec.field]: geoId,
    isDeleted: { $ne: true },
  }).distinct('_id');
  const matchedIds = matched.map(String);
  const assigned = new Set((survey.countyIds || []).map(String));
  const affectedIds =
    action === 'assign'
      ? matchedIds.filter((id) => !assigned.has(id))
      : matchedIds.filter((id) => assigned.has(id));

  return { action, geoType, geoId, matchedIds, affectedIds };
}

async function previewInstrumentCounties(survey, body) {
  const { action, geoType, geoId, affectedIds } = await resolveBulkCountyChange(survey, body);
  const counties = affectedIds.length
    ? await County.find({ _id: { $in: affectedIds }, isDeleted: { $ne: true } })
        .populate(COUNTY_POPULATE)
        .sort({ name: 1, _id: 1 })
        .lean()
    : [];

  return {
    action,
    geoType,
    geoId,
    counties: counties.map((row) => ({ ...row, _id: String(row._id) })),
    addCount: action === 'assign' ? counties.length : 0,
    removeCount: action === 'unassign' ? counties.length : 0,
  };
}

async function bulkUpdateInstrumentCounties(survey, body, userId) {
  const { action, matchedIds } = await resolveBulkCountyChange(survey, body);
  const current = (survey.countyIds || []).map(String);
  const matchedSet = new Set(matchedIds);
  let applyIds = matchedIds;
  if (body.countyIds !== undefined) {
    const requested = normalizeCountyIds(body.countyIds);
    applyIds = requested.filter((id) => matchedSet.has(id));
  }
  const applySet = new Set(applyIds);
  const next =
    action === 'assign'
      ? [...new Set([...current, ...applyIds])]
      : current.filter((id) => !applySet.has(id));

  let newVersionId = null;
  if (action === 'assign' && (body.versionId || body.version)) {
    newVersionId = String((await findPublishedVersion(survey, body))._id);
  }
  setCountyVersionRows(survey, await buildCountyVersionRows(survey, next, { newVersionId }));
  survey.updatedBy = userId;
  await survey.save();
  return {
    ...(await serializeInstrument(survey)),
    matchedCountyCount: matchedIds.length,
    changedCount: Math.abs(next.length - current.length),
  };
}

async function assertInstrumentAccess(user, survey, action) {
  const allowed = await userHasPermission(user, `SURVEY:${action}`, {
    resourceId: String(survey._id),
  });
  if (!allowed) {
    throw new HttpError(403, `Forbidden: Insufficient permissions for SURVEY:${action}.`, {
      code: ERROR_CODES.FORBIDDEN,
    });
  }
}

function assertInstrumentCoversCounty(survey, subjectType, subjectId) {
  if (String(subjectType).toUpperCase() !== 'COUNTY') return;
  const ids = (survey.countyIds || []).map(String);
  if (!ids.includes(String(subjectId))) {
    throw new HttpError(403, 'Instrument is not assigned to this county.', {
      code: ERROR_CODES.FORBIDDEN,
    });
  }
}

async function requireSubject(subjectType, subjectId) {
  const type = String(subjectType || '').toUpperCase();
  if (!SUBJECT_TYPES.includes(type)) {
    throw new ValidationError(`Unknown subject type. Use: ${SUBJECT_TYPES.join(', ')}.`);
  }
  if (!mongoose.isValidObjectId(subjectId)) {
    throw new HttpError(400, 'Invalid subject id.', { code: ERROR_CODES.VALIDATION });
  }
  const Model = SUBJECT_MODELS[type]();
  const filter =
    type === 'COUNTY' ? { _id: subjectId, isDeleted: { $ne: true } } : activeFilter({ _id: subjectId });
  const doc = await Model.findOne(filter).select('_id name');
  if (!doc) {
    throw new HttpError(404, 'Subject not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  return { type, doc };
}

async function assertSubjectAccess(user, subjectType, subjectId, action) {
  const allowed = await userHasPermission(user, `${subjectType}:${action}`, {
    resourceId: String(subjectId),
  });
  if (!allowed) {
    throw new HttpError(403, `Forbidden: Insufficient permissions for ${subjectType}:${action}.`, {
      code: ERROR_CODES.FORBIDDEN,
    });
  }
}

function isSheetOwner(doc, user) {
  return Boolean(doc?.ownerId) && String(doc.ownerId) === String(user._id);
}

async function assertCanStartSheet(user, survey, type, subjectId) {
  await assertInstrumentAccess(user, survey, 'READ');
  await assertSubjectAccess(user, type, subjectId, 'CREATE');
}

async function userCanEditSheet(user, type, subjectId, doc) {
  if (!doc) return false;
  if (await userIsAdminGroupMember(user)) return true;
  if (doc.status === 'archived') return false;
  if (await userHasPermission(user, `${type}:WRITE`, { resourceId: String(subjectId) })) {
    return true;
  }
  return OWNER_EDITABLE_STATUSES.includes(doc.status) && isSheetOwner(doc, user);
}

async function assertCanEditSheet(user, type, subjectId, doc) {
  if (await userCanEditSheet(user, type, subjectId, doc)) return;
  throw new HttpError(403, `Forbidden: Insufficient permissions to edit this ${type} sheet.`, {
    code: ERROR_CODES.FORBIDDEN,
  });
}

async function userCanDeleteSheet(user, type, subjectId, doc) {
  if (!doc) return false;
  if (await userIsAdminGroupMember(user)) return true;
  if (await userHasPermission(user, `${type}:DELETE`, { resourceId: String(subjectId) })) {
    return true;
  }
  return OWNER_EDITABLE_STATUSES.includes(doc.status) && isSheetOwner(doc, user);
}

async function assertCanDeleteSheet(user, type, subjectId, doc) {
  if (await userCanDeleteSheet(user, type, subjectId, doc)) return;
  throw new HttpError(403, `Forbidden: Insufficient permissions to delete this ${type} sheet.`, {
    code: ERROR_CODES.FORBIDDEN,
  });
}

async function assertCanViewSheet(user, type, subjectId, doc) {
  if (doc?.status === 'archived') {
    if (await userIsAdminGroupMember(user)) return;
    throw new HttpError(404, 'Subject response not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  const canRead = await userHasPermission(user, `${type}:READ`, {
    resourceId: String(subjectId),
  });
  if (canRead) return;
  if (await userCanEditSheet(user, type, subjectId, doc)) return;
  throw new HttpError(403, `Forbidden: Insufficient permissions for ${type}:READ.`, {
    code: ERROR_CODES.FORBIDDEN,
  });
}

function assertStatusTransition({ isAdmin, canWrite, isOwner, currentStatus, nextStatus, isCreate }) {
  if (nextStatus === 'archived' && !isAdmin) {
    throw new HttpError(403, 'Only administrators can archive a sheet.', {
      code: ERROR_CODES.FORBIDDEN,
    });
  }
  if (isAdmin || canWrite) return;
  if (isCreate && STARTER_STATUSES.includes(nextStatus)) return;
  if (
    isOwner &&
    OWNER_EDITABLE_STATUSES.includes(currentStatus || 'in_progress') &&
    (nextStatus === 'approved' || OWNER_EDITABLE_STATUSES.includes(nextStatus))
  ) {
    return;
  }
  throw new HttpError(403, 'Forbidden: Insufficient permissions to set this status.', {
    code: ERROR_CODES.FORBIDDEN,
  });
}

async function loadSheetContext(survey, subjectType, subjectId) {
  const { type } = await requireSubject(subjectType, subjectId);
  const doc = await InstrumentResponse.findOne(
    activeFilter({
      instrumentId: survey._id,
      subjectType: type,
      subjectId,
    })
  );
  if (doc) {
    const savedVersion = await InstrumentVersion.findById(doc.instrumentVersionId);
    if (!savedVersion) {
      throw new HttpError(404, 'Instrument version not found.', { code: ERROR_CODES.NOT_FOUND });
    }
    return { type, version: savedVersion, doc };
  }

  const versionId =
    type === 'COUNTY' ? resolveCountyVersionId(survey, subjectId) : defaultCountyVersionId(survey);
  if (!versionId) {
    throw new ValidationError('Instrument has not been published.');
  }
  const version = await InstrumentVersion.findById(versionId);
  if (!version) {
    throw new HttpError(404, 'Instrument version not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  assertInstrumentCoversCounty(survey, type, subjectId);
  return { type, version, doc: null };
}

async function assertCanMutateSubjectResponse(user, survey, subjectType, subjectId) {
  const { type, doc } = await loadSheetContext(survey, subjectType, subjectId);
  if (!doc) {
    throw new HttpError(404, 'Save the response before attaching files.', {
      code: ERROR_CODES.NOT_FOUND,
    });
  }
  await assertCanEditSheet(user, type, subjectId, doc);
}

function validateAnswersAgainstVersion(items, answers, { partial = false } = {}) {
  if (!Array.isArray(answers)) throw new ValidationError('Answers must be an array.');
  const byId = new Map(items.map((item) => [String(item.questionId), item]));
  const normalized = [];

  for (const item of items) {
    const answer = answers.find((row) => String(row.questionId) === String(item.questionId));
    if (!answer || answer.value === undefined || answer.value === null || answer.value === '') {
      if (!partial && item.required) {
        throw new ValidationError(`Missing answer for: ${item.prompt}`);
      }
      continue;
    }
    let value = answer.value;
    if (item.type === 'score') {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        throw new ValidationError(`Answer for "${item.prompt}" must be a number.`);
      }
      const max = Number(item.maxPoints) || 0;
      if (num < 0 || num > max) {
        throw new ValidationError(`Answer for "${item.prompt}" must be between 0 and ${max}.`);
      }
      value = num;
    } else if (item.type === 'text') {
      if (typeof value !== 'string') {
        throw new ValidationError(`Answer for "${item.prompt}" must be text.`);
      }
      value = value.trim();
    } else if (item.type === 'yes_no') {
      const yes = value === true || String(value).toLowerCase() === 'yes' || String(value) === '1';
      const no = value === false || String(value).toLowerCase() === 'no' || String(value) === '0';
      if (!yes && !no) throw new ValidationError(`Answer for "${item.prompt}" must be Yes or No.`);
      value = yes ? 'Yes' : 'No';
    } else if (item.type === 'multiple_choice') {
      value = String(value);
      if (!(item.options || []).includes(value)) {
        throw new ValidationError(`Answer for "${item.prompt}" must be one of the options.`);
      }
    }
    normalized.push({
      questionId: String(item.questionId),
      value,
      obs: String(answer.obs || '').trim(),
      evidenceFileId: answer.evidenceFileId || null,
    });
  }

  for (const answer of answers) {
    if (!byId.has(String(answer.questionId))) {
      throw new ValidationError(`Unknown question id: ${answer.questionId}`);
    }
  }
  return normalized;
}

function serializeResponse(doc, extras = {}) {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: String(obj._id),
    instrumentId: String(obj.instrumentId),
    instrumentVersionId: String(obj.instrumentVersionId),
    subjectType: obj.subjectType,
    subjectId: String(obj.subjectId),
    status: obj.status,
    answers: obj.answers || [],
    revision: obj.revision,
    computedScore: obj.computedScore || {},
    ownerId: obj.ownerId ? String(obj.ownerId) : null,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    createdBy: obj.createdBy,
    updatedBy: obj.updatedBy,
    ...extras,
  };
}

async function sheetExtras(survey, user, type, subjectId, doc, version) {
  const canEdit = doc ? await userCanEditSheet(user, type, subjectId, doc) : true;
  const canDelete = doc ? await userCanDeleteSheet(user, type, subjectId, doc) : false;
  const labels = await resolveSubjectLabels([{ subjectType: type, subjectId }]);
  return {
    version: version.version,
    questions: version.items.map(serializeVersionItem),
    canEdit,
    canDelete,
    surveyName: survey.name,
    subjectLabel: labels.get(`${String(type).toUpperCase()}:${subjectId}`) || '',
  };
}

async function readSubjectResponse(survey, subjectType, subjectId, user) {
  const { type, version, doc } = await loadSheetContext(survey, subjectType, subjectId);
  if (!doc) {
    await assertCanStartSheet(user, survey, type, subjectId);
    return {
      instrumentId: String(survey._id),
      instrumentVersionId: String(version._id),
      version: version.version,
      subjectType: type,
      subjectId: String(subjectId),
      status: 'in_progress',
      answers: [],
      revision: 0,
      ownerId: null,
      canEdit: true,
      canDelete: false,
      computedScore: computeScore(version.items, []),
      questions: version.items.map(serializeVersionItem),
      surveyName: survey.name,
      subjectLabel: (await resolveSubjectLabels([{ subjectType: type, subjectId }])).get(
        `${type}:${subjectId}`
      ) || '',
    };
  }
  await assertCanViewSheet(user, type, subjectId, doc);
  return serializeResponse(doc, await sheetExtras(survey, user, type, subjectId, doc, version));
}

async function saveSubjectResponse(survey, subjectType, subjectId, body, user) {
  const { type, version, doc } = await loadSheetContext(survey, subjectType, subjectId);
  const isAdmin = await userIsAdminGroupMember(user);
  const canWrite = await userHasPermission(user, `${type}:WRITE`, {
    resourceId: String(subjectId),
  });
  const status = body.status || doc?.status || 'in_progress';
  if (!RESPONSE_STATUSES.includes(status)) {
    throw new ValidationError(`Invalid status. Use: ${RESPONSE_STATUSES.join(', ')}.`);
  }

  if (!doc) {
    await assertCanStartSheet(user, survey, type, subjectId);
    assertStatusTransition({
      isAdmin,
      canWrite,
      isOwner: true,
      currentStatus: 'in_progress',
      nextStatus: status,
      isCreate: true,
    });
  } else {
    await assertCanEditSheet(user, type, subjectId, doc);
    assertStatusTransition({
      isAdmin,
      canWrite,
      isOwner: isSheetOwner(doc, user),
      currentStatus: doc.status,
      nextStatus: status,
      isCreate: false,
    });
  }

  const partial = body.partial === true || status === 'in_progress' || status === 'need_changes';
  const answers = validateAnswersAgainstVersion(version.items, body.answers || [], { partial });
  const computedScore = computeScore(version.items, answers);

  if (!doc) {
    const created = await InstrumentResponse.create({
      instrumentId: survey._id,
      instrumentVersionId: version._id,
      subjectType: type,
      subjectId,
      status,
      answers,
      revision: 1,
      computedScore,
      ownerId: user._id,
      createdBy: user._id,
      updatedBy: user._id,
    });
    await InstrumentRevision.create({
      responseId: created._id,
      revision: 1,
      snapshot: created.toObject(),
      createdBy: user._id,
    });
    if (created.status === 'approved') {
      const { syncDefaultLocalPlanForResponse } = require('./localPlanService');
      await syncDefaultLocalPlanForResponse(created, user._id);
    }
    return serializeResponse(created, await sheetExtras(survey, user, type, subjectId, created, version));
  }

  doc.answers = answers;
  doc.status = status;
  doc.computedScore = computedScore;
  doc.revision = (doc.revision || 1) + 1;
  doc.updatedBy = user._id;
  await doc.save();
  await InstrumentRevision.create({
    responseId: doc._id,
    revision: doc.revision,
    snapshot: doc.toObject(),
    createdBy: user._id,
  });
  if (doc.status === 'approved') {
    const { syncDefaultLocalPlanForResponse } = require('./localPlanService');
    await syncDefaultLocalPlanForResponse(doc, user._id);
  }
  return serializeResponse(doc, await sheetExtras(survey, user, type, subjectId, doc, version));
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

async function trashSubjectResponse(survey, subjectType, subjectId, user) {
  const { type, doc } = await loadSheetContext(survey, subjectType, subjectId);
  if (!doc) {
    throw new HttpError(404, 'Subject response not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  await assertCanDeleteSheet(user, type, subjectId, doc);
  applyTrash(doc, user._id);
  await doc.save();
  return {
    message: 'Survey answer moved to recycle bin.',
    _id: String(doc._id),
    instrumentId: String(doc.instrumentId),
    subjectType: type,
    subjectId: String(doc.subjectId),
  };
}

function serializeAnswerBinItem(doc, { surveyName, subjectLabel } = {}) {
  const type = String(doc.subjectType).toUpperCase();
  const label = subjectLabel || String(doc.subjectId);
  return {
    itemType: 'SURVEY_ANSWER',
    _id: String(doc._id),
    name: `${surveyName || 'Survey'} · ${label}`,
    detail: `${type} · ${doc.status} · rev ${doc.revision || 1}`,
    deletedAt: doc.deletedAt || null,
    deletedBy: actorRef(doc.deletedBy),
  };
}

async function toAnswerBinItem(doc) {
  const type = String(doc.subjectType).toUpperCase();
  const [survey, labels] = await Promise.all([
    Survey.findById(doc.instrumentId).select('name').lean(),
    resolveSubjectLabels([doc]),
  ]);
  return serializeAnswerBinItem(doc, {
    surveyName: survey?.name,
    subjectLabel: labels.get(`${type}:${doc.subjectId}`),
  });
}

async function listTrashedResponses() {
  const docs = await InstrumentResponse.find(trashedFilter())
    .sort({ deletedAt: -1 })
    .populate('deletedBy', 'username email');
  if (!docs.length) return [];

  const surveyIds = [...new Set(docs.map((row) => String(row.instrumentId)))];
  const [surveys, labels] = await Promise.all([
    Survey.find({ _id: { $in: surveyIds } }).select('name').lean(),
    resolveSubjectLabels(docs),
  ]);
  const surveyById = new Map(surveys.map((row) => [String(row._id), row]));

  return docs.map((doc) => {
    const type = String(doc.subjectType).toUpperCase();
    return serializeAnswerBinItem(doc, {
      surveyName: surveyById.get(String(doc.instrumentId))?.name,
      subjectLabel: labels.get(`${type}:${doc.subjectId}`),
    });
  });
}

async function restoreTrashedResponse(doc, userId) {
  const clash = await InstrumentResponse.findOne(
    activeFilter({
      _id: { $ne: doc._id },
      instrumentId: doc.instrumentId,
      subjectType: doc.subjectType,
      subjectId: doc.subjectId,
    })
  ).select('_id');
  if (clash) {
    throw new HttpError(409, 'Cannot restore: this survey already has a sheet for that subject.', {
      code: ERROR_CODES.CONFLICT,
    });
  }
  clearTrash(doc, userId);
  await doc.save();
  return doc;
}

async function purgeResponseDependents(responseId) {
  await InstrumentRevision.deleteMany({ responseId });
  const StoredFile = require('../models/StoredFile');
  const { purgeStoredFile } = require('./storedFileService');
  const files = await StoredFile.find({ ownerType: 'instrument_response', ownerId: responseId });
  for (const file of files) {
    await purgeStoredFile(file);
  }
}

async function purgeTrashedResponse(doc) {
  await purgeResponseDependents(doc._id);
  await doc.deleteOne();
  return { itemType: 'SURVEY_ANSWER', _id: String(doc._id) };
}

async function listSubjectRevisions(survey, subjectType, subjectId, user) {
  const { type, version, doc } = await loadSheetContext(survey, subjectType, subjectId);
  if (!doc) {
    await assertCanStartSheet(user, survey, type, subjectId);
    return { items: [], version: version.version };
  }
  await assertCanViewSheet(user, type, subjectId, doc);
  const items = await InstrumentRevision.find({ responseId: doc._id }).sort({ revision: 1 });
  return {
    version: version.version,
    currentRevision: doc.revision,
    items: items.map((row) => ({
      _id: String(row._id),
      revision: row.revision,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      snapshot: row.snapshot,
    })),
  };
}

async function subjectFilterForUser(user, action) {
  const clauses = [];
  for (const type of SUBJECT_TYPES) {
    const access = await listAccessibleResources(user, `${type}:${action}`);
    if (access.all) {
      clauses.push({ subjectType: type });
    } else if (access.ids.length) {
      clauses.push({ subjectType: type, subjectId: { $in: access.ids } });
    }
  }
  return clauses;
}

async function listInstrumentResponses(survey, user) {
  const clauses = await subjectFilterForUser(user, 'READ');
  if (!clauses.length) {
    return { items: [], responses: [], summary: { responseCount: 0, questions: [] } };
  }
  const version = survey.currentVersionId
    ? await InstrumentVersion.findById(survey.currentVersionId)
    : null;
  const extra = [{ $or: clauses }];
  const assignedCountyIds = await effectiveAssignedCountyIds(survey);
  if (assignedCountyIds.length) {
    extra.push({
      $or: [
        { subjectType: { $ne: 'COUNTY' } },
        { subjectId: { $in: assignedCountyIds } },
      ],
    });
  }
  if (!(await userIsAdminGroupMember(user))) {
    extra.push({ status: { $ne: 'archived' } });
  }
  const filter = activeFilter({
    instrumentId: survey._id,
    $and: extra,
  });
  const docs = await InstrumentResponse.find(filter)
    .sort({ updatedAt: -1 })
    .populate('createdBy', 'username email')
    .populate('updatedBy', 'username email');
  const questions = version ? version.items.map(serializeVersionItem) : [];
  const summaryQuestions = questions.map((question) => {
    const counts = {};
    const textAnswers = [];
    let totalAnswered = 0;
    for (const row of docs) {
      const answer = (row.answers || []).find(
        (item) => String(item.questionId) === question.questionId
      );
      if (!answer || answer.value === undefined || answer.value === '') continue;
      totalAnswered += 1;
      if (question.type === 'text') {
        textAnswers.push({
          responseId: String(row._id),
          value: String(answer.value),
          respondent: row.createdBy,
          submittedAt: row.updatedAt,
        });
      } else {
        const key = String(answer.value);
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    return {
      ...question,
      counts: question.type === 'text' ? undefined : counts,
      textAnswers: question.type === 'text' ? textAnswers : undefined,
      totalAnswered,
    };
  });
  return {
    survey: await serializeInstrumentDetail(survey),
    responses: docs.map((row) => serializeResponse(row)),
    summary: {
      surveyId: survey._id,
      surveyName: survey.name,
      responseCount: docs.length,
      questions: summaryQuestions,
    },
  };
}

async function resolveSubjectLabels(docs) {
  const byType = new Map();
  for (const row of docs) {
    const type = String(row.subjectType).toUpperCase();
    if (!byType.has(type)) byType.set(type, new Set());
    byType.get(type).add(String(row.subjectId));
  }
  const labels = new Map();
  for (const [type, ids] of byType.entries()) {
    const Model = SUBJECT_MODELS[type];
    if (!Model) continue;
    const rows = await Model()
      .find({ _id: { $in: [...ids] } })
      .select('name IBGECode')
      .lean();
    for (const row of rows) {
      labels.set(
        `${type}:${row._id}`,
        row.IBGECode ? `${row.name} (${row.IBGECode})` : row.name
      );
    }
  }
  return labels;
}

async function listAccessibleAnswers(user) {
  const clauses = await subjectFilterForUser(user, 'READ');
  if (!clauses.length) return { items: [] };
  const filter = activeFilter({ $or: clauses });
  if (!(await userIsAdminGroupMember(user))) {
    filter.status = { $ne: 'archived' };
  }
  const docs = await InstrumentResponse.find(filter)
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();
  if (!docs.length) return { items: [] };

  const surveyIds = [...new Set(docs.map((row) => String(row.instrumentId)))];
  const [surveys, labels] = await Promise.all([
    Survey.find({ _id: { $in: surveyIds } }).select('name instrumentType').lean(),
    resolveSubjectLabels(docs),
  ]);
  const surveyById = new Map(surveys.map((row) => [String(row._id), row]));

  return {
    items: docs.map((row) => {
      const survey = surveyById.get(String(row.instrumentId));
      const type = String(row.subjectType).toUpperCase();
      return {
        ...serializeResponse(row),
        surveyName: survey?.name || 'Survey',
        instrumentType: survey?.instrumentType || 'poll',
        subjectLabel: labels.get(`${type}:${row.subjectId}`) || String(row.subjectId),
      };
    }),
  };
}

async function listAnswerableCounties(survey, user, query = {}) {
  await assertInstrumentAccess(user, survey, 'READ');
  const assigned = (survey.countyIds || []).map(String);
  if (!assigned.length) {
    return paginatedResponse({
      items: [],
      total: 0,
      page: 1,
      limit: 25,
      sortField: 'name',
      orderLabel: 'asc',
    });
  }

  const access = await listAccessibleResources(user, 'COUNTY:CREATE');
  const createIds = access.all ? assigned : assigned.filter((id) => access.ids.includes(id));
  const existing = createIds.length
    ? await InstrumentResponse.find(
        activeFilter({
          instrumentId: survey._id,
          subjectType: 'COUNTY',
          subjectId: { $in: createIds },
        })
      ).select('subjectId')
    : [];
  const taken = new Set(existing.map((row) => String(row.subjectId)));
  const remaining = createIds.filter((id) => !taken.has(id));

  const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
    { ...query, order: query.order || 'asc' },
    new Set(['name', 'IBGECode']),
    'name'
  );
  const filter = { _id: { $in: remaining }, isDeleted: { $ne: true } };
  const qOr = textSearchOr(['name', 'code', 'IBGECode'], query.search || query.q);
  if (qOr) filter.$or = qOr;

  const total = remaining.length ? await County.countDocuments(filter) : 0;
  const { page, skip } = clampPage(rawPage, total, limit);
  const items = remaining.length
    ? await County.find(filter)
        .select('name IBGECode code')
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean()
    : [];

  return paginatedResponse({
    items: items.map((row) => ({
      id: String(row._id),
      _id: String(row._id),
      name: row.name,
      IBGECode: row.IBGECode,
      code: row.code,
    })),
    total,
    page,
    limit,
    sortField,
    orderLabel,
  });
}

async function listSubjectInstruments(subjectType, subjectId, user) {
  const { type } = await requireSubject(subjectType, subjectId);
  await assertSubjectAccess(user, type, subjectId, 'READ');
  const instrumentFilter = activeFilter({
    status: { $in: ['active', 'draft'] },
    currentVersionId: { $ne: null },
  });
  const responseQuery = InstrumentResponse.find(activeFilter({ subjectType: type, subjectId })).sort({
    updatedAt: -1,
  });
  const responses = await responseQuery;
  if (type === 'COUNTY') {
    const respondedIds = responses.map((row) => row.instrumentId);
    instrumentFilter.$or = [{ countyIds: subjectId }, { _id: { $in: respondedIds } }];
  }
  const instruments = await Survey.find(instrumentFilter)
    .select('name instrumentType status currentVersionId countyIds')
    .sort({ name: 1 });
  const isAdmin = await userIsAdminGroupMember(user);
  const visibleResponses = isAdmin
    ? responses
    : responses.filter((row) => row.status !== 'archived');
  const readable = [];
  for (const instrument of instruments) {
    const allowed = await userHasPermission(user, 'SURVEY:READ', {
      resourceId: String(instrument._id),
    });
    if (allowed) readable.push(instrument);
  }
  const byInstrument = new Map(visibleResponses.map((row) => [String(row.instrumentId), row]));
  return {
    items: readable.map((instrument) => {
      const response = byInstrument.get(String(instrument._id));
      return {
        instrument: {
          _id: String(instrument._id),
          name: instrument.name,
          instrumentType: instrument.instrumentType,
          status: instrument.status,
          currentVersionId: instrument.currentVersionId ? String(instrument.currentVersionId) : null,
        },
        response: response ? serializeResponse(response) : null,
      };
    }),
  };
}

async function purgeInstrumentDependents(surveyId) {
  const responses = await InstrumentResponse.find({ instrumentId: surveyId }).select('_id');
  for (const row of responses) {
    await purgeResponseDependents(row._id);
  }
  await InstrumentResponse.deleteMany({ instrumentId: surveyId });
  await InstrumentVersion.deleteMany({ instrumentId: surveyId });
}

module.exports = {
  serializeQuestion,
  serializeInstrument,
  serializeInstrumentDetail,
  normalizeQuestionInput,
  normalizeCountyIds,
  createInstrument,
  updateInstrument,
  updateInstrumentCounties,
  setCountyInstrumentVersion,
  listAssignedInstrumentCounties,
  previewInstrumentCounties,
  bulkUpdateInstrumentCounties,
  publishInstrument,
  setActiveInstrumentVersion,
  requireSubject,
  assertSubjectAccess,
  assertInstrumentAccess,
  assertCanMutateSubjectResponse,
  readSubjectResponse,
  saveSubjectResponse,
  trashSubjectResponse,
  listTrashedResponses,
  restoreTrashedResponse,
  purgeTrashedResponse,
  toAnswerBinItem,
  listSubjectRevisions,
  listInstrumentResponses,
  listAccessibleAnswers,
  listAnswerableCounties,
  listSubjectInstruments,
  purgeInstrumentDependents,
  computeScore,
  letterGrade,
};
