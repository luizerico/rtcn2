const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { createAssetSchema, registerAssetModel } = require('../Asset');
const { ASSET_TYPE_LABELS, INSTRUMENT_TYPES, INSTRUMENT_STATUSES, QUESTION_TYPES } = require('../../constants/assetTypes');

/**
 * Question owned by this instrument. `_id` is preserved from the former catalog
 * so published answers keep resolving to the same questionId.
 */
const surveyQuestionSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, maxlength: 64 },
    area: { type: String, default: '', trim: true, maxlength: 32 },
    prompt: { type: String, required: true, trim: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: true },
    evidence: { type: String, default: '', trim: true },
    criteria: { type: String, default: '', trim: true },
    maxPoints: { type: Number, default: 0, min: 0 },
    weight: { type: Number, default: 1, min: 0 },
    todo: { type: String, default: '', trim: true },
    revision: { type: Number, default: 1, min: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

/**
 * Survey / instrument definition (SURVEY asset). Draft questions live on the
 * document; published snapshots live on InstrumentVersion.
 */
const surveySchema = createAssetSchema(
  {
    instrumentType: {
      type: String,
      enum: INSTRUMENT_TYPES,
      default: 'poll',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: INSTRUMENT_STATUSES,
      default: 'draft',
      index: true,
    },
    questions: { type: [surveyQuestionSchema], default: [] },
    questionCount: { type: Number, default: 0, min: 0, index: true },
    currentVersion: { type: Number, default: null },
    countyIds: [{ type: Schema.Types.ObjectId, ref: 'County', index: true }],
    /**
     * One published snapshot per assigned county. countyIds stays the assignment
     * list; this map is the version each county uses for new answers.
     */
    countyVersions: {
      type: [
        {
          countyId: { type: Schema.Types.ObjectId, ref: 'County', required: true },
          versionId: { type: Schema.Types.ObjectId, ref: 'InstrumentVersion', required: true },
        },
      ],
      default: [],
    },
    /** Default published snapshot for newly assigned counties and non-county subjects. */
    currentVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'InstrumentVersion',
      default: null,
    },
  },
  {
    collection: 'surveys',
    assetType: ASSET_TYPE_LABELS.SURVEY,
    kind: 'SURVEY',
  }
);

surveySchema.index({ deletedAt: 1, updatedAt: -1 });
surveySchema.index({ 'countyVersions.countyId': 1 });
surveySchema.index({ 'questions._id': 1 });
surveySchema.index({ 'questions.area': 1 });
surveySchema.index({ 'questions.code': 1 });
surveySchema.index(
  {
    name: 'text',
    description: 'text',
    'questions.code': 'text',
    'questions.prompt': 'text',
    'questions.area': 'text',
  },
  { name: 'survey_question_text' }
);

surveySchema.pre('save', function syncSurveyDerivedFields() {
  this.questionCount = Array.isArray(this.questions) ? this.questions.length : 0;
  const ids = [...new Set((this.countyIds || []).map((id) => String(id)))];
  this.countyIds = ids;
  const versionByCounty = new Map();
  for (const row of this.countyVersions || []) {
    const countyId = row?.countyId ? String(row.countyId) : '';
    const versionId = row?.versionId ? String(row.versionId) : '';
    if (countyId && versionId && !versionByCounty.has(countyId)) {
      versionByCounty.set(countyId, versionId);
    }
  }
  const fallback = this.currentVersionId ? String(this.currentVersionId) : null;
  this.countyVersions = ids
    .map((countyId) => {
      const versionId = versionByCounty.get(countyId) || fallback;
      return versionId ? { countyId, versionId } : null;
    })
    .filter(Boolean);
});

const Survey = registerAssetModel('Survey', surveySchema);

module.exports = Survey;
