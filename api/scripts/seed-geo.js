const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { resolveMongoUri } = require('../config/mongoUri');
const {
  Region,
  State,
  MicroRegion,
  Biome,
  County,
  CountyStatus,
  CountyEmission,
} = require('../models/geo');
const { forEachJsonArrayObject } = require('./streamJsonArray');

dotenv.config();

const SAMPLE_DIR = path.join(__dirname, '..', '..', '01_sample_data');
const COUNTY_BATCH = 500;
const EMISSION_BATCH = 2000;

function unwrapOid(value) {
  if (value && typeof value === 'object' && typeof value.$oid === 'string') {
    return new mongoose.Types.ObjectId(value.$oid);
  }
  return value;
}

function readSampleJson(filename) {
  const filePath = path.join(SAMPLE_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function optionalTrimmed(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
}

function coerceString(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function normalizeRegion(raw) {
  return {
    _id: unwrapOid(raw._id),
    code: String(raw.code).trim(),
    name: String(raw.name).trim(),
    isDeleted: Boolean(raw.isDeleted),
  };
}

function normalizeState(raw) {
  return {
    _id: unwrapOid(raw._id),
    code: String(raw.code).trim(),
    name: String(raw.name).trim(),
    region: unwrapOid(raw.region),
    isDeleted: Boolean(raw.isDeleted),
  };
}

function normalizeMicroregion(raw) {
  const doc = {
    _id: unwrapOid(raw._id),
    name: String(raw.name).trim(),
    region: unwrapOid(raw.region),
    isDeleted: Boolean(raw.isDeleted),
  };
  if (raw.state) doc.state = unwrapOid(raw.state);
  const code = optionalTrimmed(raw.code);
  if (code) doc.code = code;
  return doc;
}

function normalizeBiome(raw) {
  return {
    _id: unwrapOid(raw._id),
    code: String(raw.code).trim(),
    name: String(raw.name).trim(),
    isDeleted: Boolean(raw.isDeleted),
  };
}

function hasRequired(doc, fields) {
  return fields.every((field) => doc[field] != null && doc[field] !== '');
}

function yearlyValues(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const value = item?.value == null || item.value === '' ? undefined : Number(item.value);
      const year = item?.year == null || item.year === '' ? undefined : Number(item.year);
      return {
        ...(Number.isFinite(value) ? { value } : {}),
        ...(Number.isFinite(year) ? { year } : {}),
      };
    })
    .filter((row) => row.value != null || row.year != null);
}

function endangeredPeopleValues(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const value = item?.value == null || item.value === '' ? undefined : Number(item.value);
    const year = item?.year == null || item.year === '' ? undefined : Number(item.year);
    const riskType = optionalTrimmed(item?.riskType);
    return {
      ...(Number.isFinite(value) ? { value } : {}),
      ...(Number.isFinite(year) ? { year } : {}),
      ...(riskType ? { riskType } : {}),
    };
  });
}

function emissionId(countyId, row) {
  if (row?._id) return unwrapOid(row._id);
  const key = [
    String(countyId),
    row?.year ?? '',
    row?.sector ?? '',
    row?.category ?? '',
    row?.subCategory ?? '',
    row?.product ?? '',
    row?.activity ?? '',
    row?.actionType ?? '',
    row?.gasType ?? '',
    row?.detail ?? '',
    row?.value ?? '',
  ].join('|');
  return new mongoose.Types.ObjectId(crypto.createHash('sha1').update(key).digest().subarray(0, 12));
}

function normalizeEmission(countyId, raw) {
  const doc = {
    _id: emissionId(countyId, raw),
    county: countyId,
  };
  const fields = [
    'actionType',
    'gasType',
    'sector',
    'category',
    'subCategory',
    'product',
    'detail',
    'activity',
  ];
  for (const field of fields) {
    const value = optionalTrimmed(raw?.[field]);
    if (value) doc[field] = value;
  }
  if (raw?.value != null && raw.value !== '') {
    const value = Number(raw.value);
    if (Number.isFinite(value)) doc.value = value;
  }
  if (raw?.year != null && raw.year !== '') {
    const year = Number(raw.year);
    if (Number.isFinite(year)) doc.year = year;
  }
  return doc;
}

function splitCounty(raw, stateRegionById) {
  const _id = unwrapOid(raw._id);
  const name = optionalTrimmed(raw.name);
  const state = raw.state ? unwrapOid(raw.state) : undefined;
  if (!_id || !name || !state) return null;

  const county = {
    _id,
    name,
    state,
    isDeleted: Boolean(raw.isDeleted),
  };

  const code = coerceString(raw.code);
  if (code !== undefined) county.code = code;
  const IBGECode = coerceString(raw.IBGECode);
  if (IBGECode) county.IBGECode = IBGECode;

  let region = raw.region ? unwrapOid(raw.region) : undefined;
  if (!region) region = stateRegionById.get(String(state));
  if (region) county.region = region;
  if (raw.microregion) county.microregion = unwrapOid(raw.microregion);
  if (raw.biome) county.biome = unwrapOid(raw.biome);

  for (const field of ['contactName', 'contactEmail', 'contactPhone', 'contactFunction', 'obs']) {
    const value = optionalTrimmed(raw[field]);
    if (value) county[field] = value;
  }
  if (raw.population != null && raw.population !== '') {
    const population = Number(raw.population);
    if (Number.isFinite(population)) county.population = population;
  }
  if (raw.location && (raw.location.lat != null || raw.location.long != null)) {
    county.location = {};
    if (raw.location.lat != null) county.location.lat = Number(raw.location.lat);
    if (raw.location.long != null) county.location.long = Number(raw.location.long);
  }
  if (Array.isArray(raw.otherBiomas) && raw.otherBiomas.length) {
    county.otherBiomas = raw.otherBiomas.map((item) => String(item).trim()).filter(Boolean);
  }

  const status = {
    _id,
    county: _id,
    endangeredPeople: endangeredPeopleValues(raw.endangeredPeople),
    disasterRate: yearlyValues(raw.disasterRate),
    hidroRisk: yearlyValues(raw.hidroRisk),
    isDeleted: Boolean(raw.isDeleted),
  };

  const emissions = Array.isArray(raw.emissions)
    ? raw.emissions.map((row) => normalizeEmission(_id, row))
    : [];

  return { county, status, emissions };
}

async function upsertMany(Model, docs, filterField = '_id') {
  if (!docs.length) return { matched: 0, upserted: 0, modified: 0 };
  const result = await Model.bulkWrite(
    docs.map((doc) => ({
      updateOne: {
        filter: { [filterField]: doc[filterField] },
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

function createBatch(Model, size, filterField = '_id') {
  const docs = [];
  const stats = { count: 0, matched: 0, upserted: 0, modified: 0 };
  return {
    stats,
    async push(doc) {
      docs.push(doc);
      stats.count += 1;
      if (docs.length >= size) await this.flush();
    },
    async flush() {
      if (!docs.length) return;
      const result = await upsertMany(Model, docs.splice(0, docs.length), filterField);
      stats.matched += result.matched;
      stats.upserted += result.upserted;
      stats.modified += result.modified;
    },
  };
}

async function seedGeo() {
  const mongoUri = resolveMongoUri();

  if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
    console.error('Seed failed: MONGODB_URI (or MONGO_URI) is required.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const regions = readSampleJson('rtcn-database.regions.json')
    .map(normalizeRegion)
    .filter((doc) => hasRequired(doc, ['_id', 'code', 'name']));
  const states = readSampleJson('rtcn-database.states.json')
    .map(normalizeState)
    .filter((doc) => hasRequired(doc, ['_id', 'code', 'name', 'region']));
  const microregionsRaw = readSampleJson('rtcn-database.microregions.json').map(normalizeMicroregion);
  const microregions = microregionsRaw.filter((doc) =>
    hasRequired(doc, ['_id', 'name', 'region', 'state'])
  );
  const skippedMicros = microregionsRaw.length - microregions.length;
  if (skippedMicros) {
    console.warn(`Skipped ${skippedMicros} microregion(s) missing required region/state refs.`);
  }
  const biomes = readSampleJson('rtcn-database.biomes.json')
    .map(normalizeBiome)
    .filter((doc) => hasRequired(doc, ['_id', 'code', 'name']));

  const regionStats = await upsertMany(Region, regions);
  const stateStats = await upsertMany(State, states);
  const microStats = await upsertMany(MicroRegion, microregions);
  const biomeStats = await upsertMany(Biome, biomes);

  console.log(`Regions: ${regions.length} rows (upserted ${regionStats.upserted}, modified ${regionStats.modified})`);
  console.log(`States: ${states.length} rows (upserted ${stateStats.upserted}, modified ${stateStats.modified})`);
  console.log(
    `Microregions: ${microregions.length} rows (upserted ${microStats.upserted}, modified ${microStats.modified})`
  );
  console.log(`Biomes: ${biomes.length} rows (upserted ${biomeStats.upserted}, modified ${biomeStats.modified})`);

  const stateRegionById = new Map(states.map((state) => [String(state._id), state.region]));
  const countyBatch = createBatch(County, COUNTY_BATCH);
  const statusBatch = createBatch(CountyStatus, COUNTY_BATCH);
  const emissionBatch = createBatch(CountyEmission, EMISSION_BATCH);
  let skippedCounties = 0;

  const countiesPath = path.join(SAMPLE_DIR, 'rtcn-database.counties.json');
  console.log('Streaming counties…');
  await forEachJsonArrayObject(countiesPath, async (raw) => {
    const split = splitCounty(raw, stateRegionById);
    if (!split) {
      skippedCounties += 1;
      return;
    }
    await countyBatch.push(split.county);
    await statusBatch.push(split.status);
    for (const emission of split.emissions) {
      await emissionBatch.push(emission);
    }
  });
  await countyBatch.flush();
  await statusBatch.flush();
  await emissionBatch.flush();

  if (skippedCounties) {
    console.warn(`Skipped ${skippedCounties} county(ies) missing name or state.`);
  }
  console.log(
    `Counties: ${countyBatch.stats.count} rows (upserted ${countyBatch.stats.upserted}, modified ${countyBatch.stats.modified})`
  );
  console.log(
    `County status: ${statusBatch.stats.count} rows (upserted ${statusBatch.stats.upserted}, modified ${statusBatch.stats.modified})`
  );
  console.log(
    `County emissions: ${emissionBatch.stats.count} rows (upserted ${emissionBatch.stats.upserted}, modified ${emissionBatch.stats.modified})`
  );

  await mongoose.connection.close();
}

if (require.main === module) {
  seedGeo().catch((error) => {
    console.error('Geography seed failed:', error.message);
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
  seedGeo,
  normalizeRegion,
  normalizeState,
  normalizeMicroregion,
  normalizeBiome,
  splitCounty,
  normalizeEmission,
};
