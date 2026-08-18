const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { resolveMongoUri } = require('../config/mongoUri');

dotenv.config();

function catalogToEmbedded(doc) {
  return {
    _id: doc._id,
    code: doc.code,
    area: doc.area || '',
    prompt: doc.prompt || doc.question || '',
    type: doc.type || 'score',
    options: doc.options || [],
    required: doc.required !== false,
    evidence: doc.evidence || '',
    criteria: doc.criteria || '',
    maxPoints: doc.maxPoints || 0,
    weight: doc.weight == null ? 1 : doc.weight,
    todo: doc.todo || '',
    revision: doc.revision || 1,
    createdBy: doc.createdBy || null,
    updatedBy: doc.updatedBy || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function versionItemToEmbedded(item) {
  if (!item) return null;
  const id = item.questionId || item._id;
  if (!id || !(item.prompt || item.code)) return null;
  return {
    _id: id,
    code: item.code,
    area: item.area || '',
    prompt: item.prompt || '',
    type: item.type || 'score',
    options: item.options || [],
    required: item.required !== false,
    evidence: item.evidence || '',
    criteria: item.criteria || '',
    maxPoints: item.maxPoints || 0,
    weight: item.weight == null ? 1 : item.weight,
    todo: item.todo || '',
    revision: item.questionRevision || item.revision || 1,
  };
}

function isEmbeddedQuestion(value) {
  return Boolean(value && typeof value === 'object' && (value.prompt || value.type) && (value.code || value.prompt));
}

function asObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  if (typeof value === 'object' && typeof value.$oid === 'string') {
    return new mongoose.Types.ObjectId(value.$oid);
  }
  if (typeof value === 'object' && value._id && !isEmbeddedQuestion(value)) {
    return asObjectId(value._id);
  }
  return null;
}

function collectQuestionIds(survey) {
  const fromIds = Array.isArray(survey.questionIds) ? survey.questionIds.map(asObjectId).filter(Boolean) : [];
  if (fromIds.length) return fromIds;
  if (!Array.isArray(survey.questions) || survey.questions.some(isEmbeddedQuestion)) return [];
  return survey.questions.map(asObjectId).filter(Boolean);
}

function buildEmbedded(ids, catalogById, versionItems) {
  const fromVersion = new Map(
    (versionItems || [])
      .map(versionItemToEmbedded)
      .filter(Boolean)
      .map((row) => [String(row._id), row])
  );
  const ordered = ids
    .map((id) => {
      const key = String(id);
      const catalog = catalogById.get(key);
      if (catalog) return catalogToEmbedded(catalog);
      return fromVersion.get(key) || null;
    })
    .filter(Boolean);
  if (ordered.length) return ordered;
  return (versionItems || []).map(versionItemToEmbedded).filter(Boolean);
}

async function dropIfExists(db, name) {
  try {
    await db.collection(name).drop();
    console.log(`Dropped collection ${name}`);
  } catch (error) {
    if (error?.codeName !== 'NamespaceNotFound' && error?.code !== 26) {
      throw error;
    }
  }
}

async function embedSurveyQuestions() {
  const mongoUri = resolveMongoUri();
  if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
    console.error('Migration failed: MONGODB_URI (or MONGO_URI) is required.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const surveys = db.collection('surveys');
  const questions = db.collection('questions');
  const versions = db.collection('instrument_versions');

  let catalog = [];
  try {
    catalog = await questions.find({}).toArray();
  } catch (error) {
    if (error?.codeName !== 'NamespaceNotFound' && error?.code !== 26) throw error;
  }
  const catalogById = new Map(catalog.map((doc) => [String(doc._id), doc]));

  let updated = 0;
  let skipped = 0;
  const cursor = surveys.find({});
  for await (const survey of cursor) {
    const alreadyEmbedded = Array.isArray(survey.questions) && survey.questions.some(isEmbeddedQuestion);
    const ids = collectQuestionIds(survey);
    const latest = await versions.find({ instrumentId: survey._id }).sort({ version: -1 }).limit(1).next();

    const embedded = alreadyEmbedded
      ? survey.questions.filter(isEmbeddedQuestion)
      : buildEmbedded(ids, catalogById, latest?.items);

    if (!embedded.length) {
      skipped += 1;
      console.warn(`Skipped ${survey._id} (${survey.name || 'unnamed'}): no catalog or version questions found.`);
      continue;
    }

    await surveys.updateOne(
      { _id: survey._id },
      {
        $set: {
          questions: embedded,
          questionCount: embedded.length,
          currentVersion: latest?.version || survey.currentVersion || null,
        },
        $unset: { questionIds: 1 },
      }
    );
    updated += 1;
    console.log(`Embedded ${embedded.length} questions onto ${survey.name || survey._id}`);
  }

  const stillMissing = await surveys.countDocuments({
    $or: [{ questions: { $exists: false } }, { questions: { $size: 0 } }, { 'questions.prompt': { $exists: false } }],
  });
  if (stillMissing === 0) {
    await dropIfExists(db, 'questions');
    await dropIfExists(db, 'question_revisions');
  } else {
    console.warn(`Kept questions collections: ${stillMissing} surveys still have no embedded prompts.`);
  }

  console.log(`Embedded questions onto ${updated} surveys; skipped ${skipped}.`);
  await mongoose.connection.close();
}

if (require.main === module) {
  embedSurveyQuestions().catch((error) => {
    console.error('Embed survey questions failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  embedSurveyQuestions,
  catalogToEmbedded,
  collectQuestionIds,
  isEmbeddedQuestion,
  buildEmbedded,
};
