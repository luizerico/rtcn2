const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { resolveMongoUri } = require('../config/mongoUri');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { Sponsor, Opportunity, Project } = require('../models/assets');
const Survey = require('../models/assets/Survey');
const { InstrumentVersion, InstrumentResponse, InstrumentRevision } = require('../models/survey');
const County = require('../models/geo/County');
const { ASSET_TYPE_LABELS } = require('../constants/assetTypes');
const { computeScore } = require('../services/surveyInstrumentService');
const {
  SPONSOR_ORIGEM,
  OPPORTUNITY_TYPE,
  OPPORTUNITY_CATEGORY,
  OPPORTUNITY_ELIGIBILITY,
  RELATED_ENTITY_TYPES,
  DEFAULT_CURRENCY,
} = require('../constants/fundingTypes');

dotenv.config();

const SAMPLE_DIR = path.join(__dirname, '..', '..', '01_sample_data');
const BATCH_SIZE = 200;

const SKIPPED_FILES = [
  ['rtcn-database.regions.json', 'use npm run db:seed-geo'],
  ['rtcn-database.states.json', 'use npm run db:seed-geo'],
  ['rtcn-database.microregions.json', 'use npm run db:seed-geo'],
  ['rtcn-database.biomes.json', 'use npm run db:seed-geo'],
  ['rtcn-database.counties.json', 'use npm run db:seed-geo'],
  ['rtcn-database.groups.json', 'legacy groups are not the current RBAC model'],
  ['rtcn-database.permissions.json', 'legacy ACL rows are not current Permission grants'],
  ['rtcn-database.localplans.json', 'no LocalPlan collection'],
  ['rtcn-database.refreshtokens.json', 'skipped (secrets / unused)'],
  ['rtcn-database.securitylogs.json', 'skipped (legacy logs)'],
];

function unwrapOid(value) {
  if (value == null) return undefined;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  if (typeof value === 'object' && typeof value.$oid === 'string') {
    return new mongoose.Types.ObjectId(value.$oid);
  }
  return undefined;
}

function unwrapDate(value) {
  if (value == null || value === '') return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'object' && typeof value.$date === 'string') {
    const date = new Date(value.$date);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function unwrapIdList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(unwrapOid).filter(Boolean);
}

function mapAnswerItems(rawAnswers) {
  if (!Array.isArray(rawAnswers)) return [];
  return rawAnswers
    .map((item) => {
      const questionId = unwrapOid(item.question || item.questionId);
      if (!questionId) return null;
      const filename = trimmed(item.document);
      const obsParts = [trimmed(item.obs), filename].filter(Boolean);
      const num = toNumber(item.answer);
      return {
        questionId: String(questionId),
        value: num == null ? item.answer : num,
        obs: obsParts.join('\n'),
        evidenceFileId: null,
      };
    })
    .filter(Boolean);
}

function normalizeQuestion(raw, fallbackOwnerId) {
  if (!raw) return { skipReason: 'empty row' };
  if (isSourceDeleted(raw) && !includeDeleted()) return { skipReason: 'deleted in source' };
  const _id = unwrapOid(raw._id);
  if (!_id) return { skipReason: 'missing id' };
  const code = trimmed(raw.code);
  const prompt = trimmed(raw.question || raw.prompt);
  if (!code) return { skipReason: 'missing code' };
  if (!prompt) return { skipReason: 'missing prompt' };
  const audit = auditFields(raw, fallbackOwnerId);
  return {
    doc: {
      _id,
      code,
      area: optionalString(raw.area),
      prompt,
      type: 'score',
      options: [],
      required: true,
      evidence: optionalString(raw.evidence),
      criteria: optionalString(raw.criteria),
      maxPoints: toNumber(raw.maxPoints) || 2,
      weight: toNumber(raw.weight) == null ? 1 : toNumber(raw.weight),
      todo: optionalString(raw.todo),
      createdBy: audit.createdBy,
      updatedBy: audit.updatedBy,
    },
  };
}

function snapshotEmbeddedQuestions(questions) {
  return questions.map((doc, index) => ({
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
    sortOrder: index,
  }));
}

function loadQuestionMap(fallbackOwnerId) {
  const filename = 'rtcn-database.questions.json';
  const rows = readSampleJson(filename);
  const map = new Map();
  if (!Array.isArray(rows)) {
    console.log(`${filename}: missing or not an array — skipped`);
    return map;
  }
  let skipped = 0;
  for (const raw of rows) {
    const { doc } = normalizeQuestion(raw, fallbackOwnerId);
    if (!doc) {
      skipped += 1;
      continue;
    }
    map.set(String(doc._id), doc);
  }
  console.log(`Questions: ${map.size} loaded for embedding; skipped ${skipped}`);
  return map;
}

function embedQuestionsFromIds(questionIds, questionMap) {
  return questionIds
    .map((id) => {
      const doc = questionMap.get(String(id));
      return doc ? { ...doc } : null;
    })
    .filter(Boolean);
}

async function dropRetiredQuestionCollections() {
  for (const name of ['questions', 'question_revisions']) {
    try {
      await mongoose.connection.collection(name).drop();
      console.log(`Dropped leftover collection: ${name}`);
    } catch (error) {
      if (error?.codeName !== 'NamespaceNotFound' && error?.code !== 26) {
        throw error;
      }
    }
  }
}

async function importQuestionaries(fallbackOwnerId, questionMap) {
  const filename = 'rtcn-database.questionaries.json';
  const rows = readSampleJson(filename);
  if (!Array.isArray(rows)) {
    console.log(`${filename}: missing or not an array — skipped`);
    return { surveys: [], versionsByQuestionary: new Map() };
  }

  const surveys = [];
  const versionsByQuestionary = new Map();
  const skips = [];

  for (const raw of rows) {
    if (!raw) {
      skips.push('empty row');
      continue;
    }
    if (isSourceDeleted(raw) && !includeDeleted()) {
      skips.push('deleted in source');
      continue;
    }
    const _id = unwrapOid(raw._id);
    const name = trimmed(raw.name);
    const questionIds = unwrapIdList(raw.questions);
    if (!_id || !name || !questionIds.length) {
      skips.push('invalid questionary');
      continue;
    }
    const questions = embedQuestionsFromIds(questionIds, questionMap);
    if (!questions.length) {
      skips.push('no matching questions');
      continue;
    }
    const audit = auditFields(raw, fallbackOwnerId);
    const status = trimmed(raw.status) === 'active' ? 'active' : 'draft';
    const survey = await Survey.findByIdAndUpdate(
      _id,
      {
        $set: {
          name,
          description: optionalString(raw.description),
          kind: 'SURVEY',
          assetType: ASSET_TYPE_LABELS.SURVEY,
          instrumentType: 'scored_diagnostic',
          status,
          questions,
          questionCount: questions.length,
          ownerId: audit.ownerId,
          createdBy: audit.createdBy,
          updatedBy: audit.updatedBy,
        },
        $unset: { questionIds: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    let version = await InstrumentVersion.findOne({ instrumentId: survey._id, version: 1 });
    if (!version) {
      version = await InstrumentVersion.create({
        instrumentId: survey._id,
        version: 1,
        items: snapshotEmbeddedQuestions(questions),
        publishedAt: unwrapDate(raw.approvedAt) || unwrapDate(raw.createdAt) || new Date(),
        publishedBy: audit.createdBy,
      });
    }
    survey.currentVersionId = version._id;
    survey.currentVersion = version.version;
    survey.status = 'active';
    await survey.save();
    surveys.push(survey);
    versionsByQuestionary.set(String(_id), version);
  }

  console.log(
    `Questionaries: ${surveys.length} imported as instruments; skipped ${skips.length}`
  );
  if (skips.length) console.log(`  skip reasons: ${summarizeSkips(skips)}`);
  return { surveys, versionsByQuestionary };
}

async function importAnswers(fallbackOwnerId, versionsByQuestionary) {
  const filename = 'rtcn-database.answers.json';
  const rows = readSampleJson(filename);
  if (!Array.isArray(rows)) {
    console.log(`${filename}: missing or not an array — skipped`);
    return { ids: new Set() };
  }

  const docs = [];
  const skips = [];
  for (const raw of rows) {
    if (!raw) {
      skips.push('empty row');
      continue;
    }
    if (isSourceDeleted(raw) && !includeDeleted()) {
      skips.push('deleted in source');
      continue;
    }
    const _id = unwrapOid(raw._id);
    const countyId = unwrapOid(raw.county);
    const questionaryId = unwrapOid(raw.questionary);
    if (!_id || !countyId || !questionaryId) {
      skips.push('missing ids');
      continue;
    }
    const county = await County.findOne({ _id: countyId, isDeleted: { $ne: true } }).select('_id');
    if (!county) {
      skips.push('county not imported');
      continue;
    }
    const version = versionsByQuestionary.get(String(questionaryId));
    if (!version) {
      skips.push('questionary not imported');
      continue;
    }
    const answers = mapAnswerItems(raw.answers);
    const status = ['in_progress', 'pending', 'need_changes', 'approved', 'archived'].includes(
      trimmed(raw.status)
    )
      ? trimmed(raw.status)
      : 'in_progress';
    const audit = auditFields(raw, fallbackOwnerId);
    const revision = toNumber(raw.version) || 1;
    docs.push({
      _id,
      instrumentId: version.instrumentId,
      instrumentVersionId: version._id,
      subjectType: 'COUNTY',
      subjectId: countyId,
      status,
      answers,
      revision,
      computedScore: computeScore(version.items, answers),
      ownerId: audit.ownerId,
      createdBy: audit.createdBy,
      updatedBy: unwrapOid(raw.lastChangedBy) || audit.updatedBy,
    });
  }

  const stats = { count: 0, skipped: skips.length };
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    await upsertMany(InstrumentResponse, batch);
    stats.count += batch.length;
  }
  console.log(`Answers: ${stats.count} imported as instrument responses; skipped ${stats.skipped}`);
  if (skips.length) console.log(`  skip reasons: ${summarizeSkips(skips)}`);

  const byInstrument = new Map();
  for (const doc of docs) {
    const key = String(doc.instrumentId);
    const countyId = String(doc.subjectId);
    if (!byInstrument.has(key)) byInstrument.set(key, new Set());
    byInstrument.get(key).add(countyId);
  }
  for (const [instrumentId, countyIds] of byInstrument.entries()) {
    const objectIds = [...countyIds]
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (!objectIds.length) continue;
    await Survey.updateOne(
      { _id: instrumentId },
      { $addToSet: { countyIds: { $each: objectIds } } }
    );
  }

  return { ids: new Set(docs.map((doc) => String(doc._id))) };
}

async function importHistoryAnswers(fallbackOwnerId, responseIds) {
  const filename = 'rtcn-database.historyanswers.json';
  const rows = readSampleJson(filename);
  if (!Array.isArray(rows)) {
    console.log(`${filename}: missing or not an array — skipped`);
    return;
  }

  const docs = [];
  const skips = [];
  for (const raw of rows) {
    const responseId = unwrapOid(raw.answer);
    if (!responseId || !responseIds.has(String(responseId))) {
      skips.push('answer not imported');
      continue;
    }
    const revision = toNumber(raw.version) || 1;
    const old = raw.oldAnswer && typeof raw.oldAnswer === 'object' ? raw.oldAnswer : {};
    docs.push({
      responseId,
      revision,
      snapshot: {
        subjectType: 'COUNTY',
        subjectId: unwrapOid(old.county),
        status: old.status || 'in_progress',
        answers: mapAnswerItems(old.answers),
        letter: old.score || '',
        source: 'historyanswers',
      },
      createdBy: unwrapOid(raw.createdBy) || fallbackOwnerId,
      createdAt: unwrapDate(raw.createdAt) || new Date(),
    });
  }

  let imported = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    try {
      await InstrumentRevision.bulkWrite(
        batch.map((doc) => ({
          updateOne: {
            filter: { responseId: doc.responseId, revision: doc.revision },
            update: { $set: doc },
            upsert: true,
          },
        })),
        { ordered: false }
      );
      imported += batch.length;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      imported += batch.length;
    }
  }
  console.log(`History answers: ${imported} imported as instrument revisions; skipped ${skips.length}`);
  if (skips.length) console.log(`  skip reasons: ${summarizeSkips(skips)}`);
}

function trimmed(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function optionalString(value) {
  const str = trimmed(value);
  return str || '';
}

function toNumber(value) {
  if (value == null || value === '') return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => trimmed(item)).filter(Boolean);
}

function includeDeleted() {
  return process.env.IMPORT_DELETED === '1' || process.env.IMPORT_DELETED === 'true';
}

function isSourceDeleted(raw) {
  return Boolean(raw?.isDeleted);
}

function auditFields(raw, fallbackOwnerId) {
  const createdBy = unwrapOid(raw.createdBy) || fallbackOwnerId;
  const updatedBy = unwrapOid(raw.updatedBy) || createdBy || fallbackOwnerId;
  const createdAt = unwrapDate(raw.createdAt);
  const updatedAt = unwrapDate(raw.updatedAt) || createdAt;
  return {
    ownerId: createdBy,
    createdBy,
    updatedBy,
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

const DUMMY_GOOGLE_IDS = new Set(['000000']);

function isBcryptHash(value) {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$.{53}$/.test(value);
}

function trashFromSource(raw) {
  if (!isSourceDeleted(raw)) return { deletedAt: null, deletedBy: null };
  return {
    deletedAt: unwrapDate(raw.deletedAt) || new Date(),
    deletedBy: unwrapOid(raw.deletedBy) || null,
  };
}

function timestampsFromSource(raw) {
  const createdAt = unwrapDate(raw.createdAt);
  const updatedAt = unwrapDate(raw.updatedAt) || createdAt;
  return {
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function normalizeOrganization(raw) {
  if (!raw) return { skipReason: 'empty row' };
  if (isSourceDeleted(raw) && !includeDeleted()) return { skipReason: 'deleted in source' };

  const _id = unwrapOid(raw._id);
  const name = trimmed(raw.name);
  if (!_id) return { skipReason: 'missing id' };
  if (!name || name.length < 2) return { skipReason: 'missing name' };

  const email = optionalString(raw.email).toLowerCase();
  return {
    doc: {
      _id,
      name: name.slice(0, 100),
      description: optionalString(raw.description).slice(0, 500),
      website: optionalString(raw.website).slice(0, 2048),
      email,
      phone: optionalString(raw.phone).slice(0, 50),
      ...trashFromSource(raw),
      ...timestampsFromSource(raw),
    },
  };
}

function normalizeUser(raw, organizationIds) {
  if (!raw) return { skipReason: 'empty row' };
  if (isSourceDeleted(raw) && !includeDeleted()) return { skipReason: 'deleted in source' };

  const _id = unwrapOid(raw._id);
  const username = trimmed(raw.name || raw.username);
  const email = trimmed(raw.email).toLowerCase();
  const password = trimmed(raw.password);
  if (!_id) return { skipReason: 'missing id' };
  if (!username) return { skipReason: 'missing username' };
  if (!email) return { skipReason: 'missing email' };
  if (!isBcryptHash(password)) return { skipReason: 'missing password hash' };

  const googleRaw = trimmed(raw.googleId);
  const googleId = googleRaw && !DUMMY_GOOGLE_IDS.has(googleRaw) ? googleRaw : undefined;
  const orgId = unwrapOid(raw.organization);
  const organization =
    orgId && organizationIds instanceof Set && organizationIds.has(String(orgId)) ? orgId : null;
  const language = trimmed(raw.language).slice(0, 10) || null;

  const doc = {
    _id,
    username,
    email,
    password,
    isVerified: true,
    isEnabled: raw.isEnabled !== false,
    organization,
    lastLoginAt: unwrapDate(raw.lastLogin || raw.lastLoginAt) || null,
    language,
    ...trashFromSource(raw),
    ...timestampsFromSource(raw),
  };
  if (googleId) doc.googleId = googleId;
  return { doc, unsetGoogleId: !googleId };
}

function bootstrapAdminIdentity() {
  return {
    username: String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase(),
    email: String(process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase(),
  };
}

async function importUsers(organizationIds) {
  const filename = 'rtcn-database.users.json';
  const rows = readSampleJson(filename);
  if (!Array.isArray(rows)) {
    throw new Error(`${filename} is not a JSON array.`);
  }

  const admin = bootstrapAdminIdentity();
  const existing = await User.find({}).select('_id username email');
  const byUsername = new Map();
  const byEmail = new Map();
  for (const user of existing) {
    byUsername.set(String(user.username).toLowerCase(), String(user._id));
    byEmail.set(String(user.email).toLowerCase(), String(user._id));
  }

  const ops = [];
  const skips = [];
  for (const raw of rows) {
    const result = normalizeUser(raw, organizationIds);
    if (result.skipReason) {
      skips.push(result.skipReason);
      continue;
    }

    const { doc, unsetGoogleId } = result;
    const usernameKey = String(doc.username).toLowerCase();
    const emailKey = String(doc.email).toLowerCase();
    if (usernameKey === admin.username || emailKey === admin.email) {
      skips.push('bootstrap admin conflict');
      continue;
    }

    const id = String(doc._id);
    const existingByName = byUsername.get(usernameKey);
    const existingByEmail = byEmail.get(emailKey);
    if ((existingByName && existingByName !== id) || (existingByEmail && existingByEmail !== id)) {
      skips.push('username or email already in use');
      continue;
    }

    const update = { $set: doc };
    if (unsetGoogleId) update.$unset = { googleId: '' };
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update,
        upsert: true,
      },
    });
    byUsername.set(usernameKey, id);
    byEmail.set(emailKey, id);
  }

  const stats = { count: 0, matched: 0, upserted: 0, modified: 0, skipped: skips.length };
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = ops.slice(i, i + BATCH_SIZE);
    const written = await User.bulkWrite(batch, { ordered: false });
    stats.count += batch.length;
    stats.matched += written.matchedCount;
    stats.upserted += written.upsertedCount;
    stats.modified += written.modifiedCount;
  }

  console.log(
    `Users: ${stats.count} imported (upserted ${stats.upserted}, modified ${stats.modified}); skipped ${stats.skipped}`
  );
  if (skips.length) {
    console.log(`  skip reasons: ${summarizeSkips(skips)}`);
  }
  return stats;
}

function normalizeSponsor(raw, fallbackOwnerId) {
  if (!raw) return { skipReason: 'empty row' };
  if (isSourceDeleted(raw) && !includeDeleted()) return { skipReason: 'deleted in source' };

  const name = trimmed(raw.orgName || raw.name);
  const orgEmail = trimmed(raw.orgEmail || raw.email);
  const origem = trimmed(raw.origem);
  const contact = trimmed(raw.contact);
  const phone = trimmed(raw.phone);
  if (!name) return { skipReason: 'missing name' };
  if (!orgEmail) return { skipReason: 'missing orgEmail' };
  if (!SPONSOR_ORIGEM.includes(origem)) return { skipReason: `invalid origem (${origem || 'empty'})` };
  if (!contact) return { skipReason: 'missing contact' };
  if (!phone) return { skipReason: 'missing phone' };

  const _id = unwrapOid(raw._id);
  if (!_id) return { skipReason: 'missing id' };

  return {
    doc: {
      _id,
      name,
      description: optionalString(raw.description),
      kind: 'SPONSOR',
      assetType: ASSET_TYPE_LABELS.SPONSOR,
      orgEmail,
      origem,
      orgUnit: optionalString(raw.orgUnit || raw.unit),
      webpage: optionalString(raw.webpage),
      email: optionalString(raw.email),
      socialMedia: optionalString(raw.socialMedia),
      contact,
      phone,
      address: optionalString(raw.address),
      city: optionalString(raw.city),
      state: optionalString(raw.state),
      zipCode: optionalString(raw.zipCode),
      country: optionalString(raw.country),
      obs: optionalString(raw.obs),
      ...auditFields(raw, fallbackOwnerId),
    },
  };
}

function normalizeOpportunity(raw, fallbackOwnerId, sponsorIds) {
  if (!raw) return { skipReason: 'empty row' };
  if (isSourceDeleted(raw) && !includeDeleted()) return { skipReason: 'deleted in source' };

  const name = trimmed(raw.name);
  const description = trimmed(raw.description);
  const sponsor = unwrapOid(raw.sponsor);
  const type = trimmed(raw.type);
  const category = trimmed(raw.category);
  const eligibility = trimmed(raw.eligibility);
  const website = trimmed(raw.website);
  const submissionMethod = trimmed(raw.submissionMethod);
  const startDate = unwrapDate(raw.startDate);
  const budget = toNumber(raw.budget);
  const _id = unwrapOid(raw._id);

  if (!_id) return { skipReason: 'missing id' };
  if (!name) return { skipReason: 'missing name' };
  if (!description) return { skipReason: 'missing description' };
  if (!sponsor) return { skipReason: 'missing sponsor' };
  if (sponsorIds && !sponsorIds.has(String(sponsor))) return { skipReason: 'sponsor not imported' };
  if (!OPPORTUNITY_TYPE.includes(type)) return { skipReason: `invalid type (${type || 'empty'})` };
  if (!OPPORTUNITY_CATEGORY.includes(category)) {
    return { skipReason: `invalid category (${category || 'empty'})` };
  }
  if (!OPPORTUNITY_ELIGIBILITY.includes(eligibility)) {
    return { skipReason: `invalid eligibility (${eligibility || 'empty'})` };
  }
  if (!website) return { skipReason: 'missing website' };
  if (!submissionMethod) return { skipReason: 'missing submissionMethod' };
  if (!startDate) return { skipReason: 'missing startDate' };
  if (budget == null) return { skipReason: 'missing budget' };

  const endDate = unwrapDate(raw.endDate);
  const totalBudget = toNumber(raw.totalBudget);

  return {
    doc: {
      _id,
      name,
      description,
      kind: 'OPPORTUNITY',
      assetType: ASSET_TYPE_LABELS.OPPORTUNITY,
      sponsor,
      areas: unwrapIdList(raw.areas),
      type,
      category,
      eligibility,
      website,
      submissionMethod,
      startDate,
      ...(endDate ? { endDate } : {}),
      continuous: Boolean(raw.continuous),
      budget,
      ...(totalBudget == null ? {} : { totalBudget }),
      currency: optionalString(raw.currency) || DEFAULT_CURRENCY,
      obs: stringList(raw.obs),
      documents: stringList(raw.documents),
      ...auditFields(raw, fallbackOwnerId),
    },
  };
}

function normalizeProject(raw, fallbackOwnerId) {
  if (!raw) return { skipReason: 'empty row' };
  if (isSourceDeleted(raw) && !includeDeleted()) return { skipReason: 'deleted in source' };

  const name = trimmed(raw.projName || raw.name);
  const description = trimmed(raw.projDescription || raw.description);
  const projWebsite = trimmed(raw.projWebsite);
  const projStartDate = unwrapDate(raw.projStartDate);
  const projBudget = toNumber(raw.projBudget);
  const projStatus = trimmed(raw.projStatus);
  const _id = unwrapOid(raw._id);

  if (!_id) return { skipReason: 'missing id' };
  if (!name) return { skipReason: 'missing name' };
  if (!description) return { skipReason: 'missing description' };
  if (!projWebsite) return { skipReason: 'missing projWebsite' };
  if (!projStartDate) return { skipReason: 'missing projStartDate' };
  if (projBudget == null) return { skipReason: 'missing projBudget' };
  if (!projStatus) return { skipReason: 'missing projStatus' };

  const opportunity = unwrapOid(raw.opportunity);
  const projEndDate = unwrapDate(raw.projEndDate);
  let relatedEntity;
  if (raw.relatedEntity && typeof raw.relatedEntity === 'object') {
    const entityType = trimmed(raw.relatedEntity.entityType).toLowerCase();
    const entityId = unwrapIdList(raw.relatedEntity.entityId);
    if (RELATED_ENTITY_TYPES.includes(entityType)) {
      relatedEntity = { entityType, entityId };
    }
  }

  return {
    doc: {
      _id,
      name,
      description,
      kind: 'PROJECT',
      assetType: ASSET_TYPE_LABELS.PROJECT,
      areas: unwrapIdList(raw.areas),
      ...(opportunity ? { opportunity } : {}),
      ...(relatedEntity ? { relatedEntity } : {}),
      projWebsite,
      projStartDate,
      ...(projEndDate ? { projEndDate } : {}),
      projBudget,
      currency: optionalString(raw.currency) || DEFAULT_CURRENCY,
      projStatus,
      projComments: stringList(raw.projComments),
      projDocuments: stringList(raw.projDocuments),
      obs: optionalString(raw.obs),
      ...auditFields(raw, fallbackOwnerId),
    },
  };
}

function readSampleJson(filename) {
  const filePath = path.join(SAMPLE_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Sample file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function upsertMany(Model, docs) {
  if (!docs.length) return { matched: 0, upserted: 0, modified: 0 };
  const result = await Model.bulkWrite(
    docs.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: doc },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  return {
    matched: result.matchedCount,
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
  };
}

function summarizeSkips(skips) {
  const counts = {};
  for (const reason of skips) {
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(', ');
}

async function importMapped(filename, Model, normalize, extra) {
  const rows = readSampleJson(filename);
  if (!Array.isArray(rows)) {
    throw new Error(`${filename} is not a JSON array.`);
  }

  const docs = [];
  const skips = [];
  for (const raw of rows) {
    const result = normalize(raw, extra.fallbackOwnerId, extra.sponsorIds);
    if (result.skipReason) {
      skips.push(result.skipReason);
      continue;
    }
    docs.push(result.doc);
  }

  const stats = { count: 0, matched: 0, upserted: 0, modified: 0, skipped: skips.length };
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const written = await upsertMany(Model, batch);
    stats.count += batch.length;
    stats.matched += written.matched;
    stats.upserted += written.upserted;
    stats.modified += written.modified;
  }

  const noun = extra.noun;
  console.log(
    `${noun}: ${stats.count} imported (upserted ${stats.upserted}, modified ${stats.modified}); skipped ${stats.skipped}`
  );
  if (skips.length) {
    console.log(`  skip reasons: ${summarizeSkips(skips)}`);
  }
  return { docs, stats };
}

async function resolveFallbackOwner() {
  const email = String(process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
  const username = process.env.ADMIN_USERNAME || 'admin';
  const user =
    (await User.findOne({ email })) ||
    (await User.findOne({ username })) ||
    (await User.findOne({}));
  if (!user) {
    throw new Error('No user found to own imported assets. Run `npm run db:init` first.');
  }
  return user._id;
}

async function importSampleData() {
  const mongoUri = resolveMongoUri();
  if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
    console.error('Import failed: MONGODB_URI (or MONGO_URI) is required.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
  console.log(`Sample directory: ${SAMPLE_DIR}`);
  if (includeDeleted()) {
    console.log('IMPORT_DELETED=1: including rows marked isDeleted in the dump.');
  }

  const fallbackOwnerId = await resolveFallbackOwner();
  console.log(`Asset owner fallback: ${fallbackOwnerId}`);

  const organizations = await importMapped(
    'rtcn-database.organizations.json',
    Organization,
    normalizeOrganization,
    { fallbackOwnerId, noun: 'Organizations' }
  );
  const organizationIds = new Set(organizations.docs.map((doc) => String(doc._id)));
  await importUsers(organizationIds);

  const sponsors = await importMapped(
    'rtcn-database.sponsors.json',
    Sponsor,
    normalizeSponsor,
    { fallbackOwnerId, noun: 'Sponsors' }
  );
  const sponsorIds = new Set(sponsors.docs.map((doc) => String(doc._id)));

  await importMapped('rtcn-database.opportunities.json', Opportunity, normalizeOpportunity, {
    fallbackOwnerId,
    sponsorIds,
    noun: 'Opportunities',
  });
  await importMapped('rtcn-database.projects.json', Project, normalizeProject, {
    fallbackOwnerId,
    noun: 'Projects',
  });

  const questionMap = loadQuestionMap(fallbackOwnerId);
  const { versionsByQuestionary } = await importQuestionaries(fallbackOwnerId, questionMap);
  const answers = await importAnswers(fallbackOwnerId, versionsByQuestionary);
  await importHistoryAnswers(fallbackOwnerId, answers.ids);
  await dropRetiredQuestionCollections();

  console.log('Skipped files (no matching collection, or handled elsewhere):');
  for (const [file, reason] of SKIPPED_FILES) {
    const exists = fs.existsSync(path.join(SAMPLE_DIR, file));
    console.log(`  ${file}${exists ? '' : ' (missing)'}: ${reason}`);
  }

  await mongoose.connection.close();
}

if (require.main === module) {
  importSampleData().catch((error) => {
    console.error('Sample data import failed:', error.message);
    if (/auth/i.test(error.message)) {
      console.error(
        'Hint: Docker Mongo needs credentials. Set MONGO_ROOT_USER/MONGO_ROOT_PASS or use:'
      );
      console.error(
        'MONGO_URI=mongodb://root:rootpassword@localhost:27178/projects?authSource=admin'
      );
    }
    process.exit(1);
  });
}

module.exports = {
  unwrapOid,
  unwrapDate,
  normalizeSponsor,
  normalizeOpportunity,
  normalizeProject,
  normalizeQuestion,
  normalizeOrganization,
  normalizeUser,
  importSampleData,
  SAMPLE_DIR,
};
