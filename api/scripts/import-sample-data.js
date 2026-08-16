const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { resolveMongoUri } = require('../config/mongoUri');
const User = require('../models/User');
const { Sponsor, Opportunity, Project } = require('../models/assets');
const { ASSET_TYPE_LABELS } = require('../constants/assetTypes');
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
  ['rtcn-database.users.json', 'schema does not match User (use npm run db:init)'],
  ['rtcn-database.groups.json', 'legacy groups are not the current RBAC model'],
  ['rtcn-database.permissions.json', 'legacy ACL rows are not current Permission grants'],
  ['rtcn-database.organizations.json', 'no Organization collection'],
  ['rtcn-database.questions.json', 'no Question collection'],
  ['rtcn-database.questionaries.json', 'no Questionary collection'],
  ['rtcn-database.answers.json', 'no Answer collection'],
  ['rtcn-database.historyanswers.json', 'no HistoryAnswer collection'],
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
  importSampleData,
  SAMPLE_DIR,
};
