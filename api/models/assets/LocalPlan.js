const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { createAssetSchema, registerAssetModel } = require('../Asset');
const { ASSET_TYPE_LABELS } = require('../../constants/assetTypes');
const {
  LOCALPLAN_STATUSES,
  INCLUSION_MODES,
  YES_NO,
  LEVELS,
  PRIORITY_TERMS,
} = require('../../constants/localPlan');

const prioritySchema = new Schema(
  {
    term: { type: String, enum: PRIORITY_TERMS, required: true },
    score: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const planEntrySchema = new Schema(
  {
    questionId: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, maxlength: 64 },
    area: { type: String, default: '', trim: true, maxlength: 32 },
    todo: { type: String, default: '', trim: true },
    technical: {
      opportunities: {
        federal: { type: String, enum: YES_NO, default: 'no' },
        state: { type: String, enum: YES_NO, default: 'no' },
        partners: { type: String, enum: YES_NO, default: 'no' },
      },
      complexity: {
        administrative: { type: String, enum: LEVELS, default: 'medium' },
        financial: { type: String, enum: LEVELS, default: 'medium' },
      },
      isMandatory: { type: Boolean, default: false },
    },
    consultant: {
      financialCapacity: { type: String, enum: LEVELS, default: 'medium' },
      planCapacity: { type: String, enum: LEVELS, default: 'medium' },
      interCooperation: { type: String, enum: LEVELS, default: 'medium' },
    },
    isLocalAgenda: { type: Boolean, default: false },
    technicalPriority: { type: prioritySchema, required: true },
    governmentPriority: { type: prioritySchema, required: true },
  },
  { _id: false }
);

const localPlanSchema = createAssetSchema(
  {
    surveyId: {
      type: Schema.Types.ObjectId,
      ref: 'Survey',
      required: true,
      index: true,
    },
    instrumentResponseId: {
      type: Schema.Types.ObjectId,
      ref: 'InstrumentResponse',
      required: true,
      index: true,
    },
    instrumentVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'InstrumentVersion',
      required: true,
    },
    countyId: {
      type: Schema.Types.ObjectId,
      ref: 'County',
      required: true,
      index: true,
    },
    sourceRevision: { type: Number, required: true, min: 1 },
    inclusionMode: { type: String, enum: INCLUSION_MODES, required: true },
    includedQuestionIds: { type: [String], default: [] },
    status: {
      type: String,
      enum: LOCALPLAN_STATUSES,
      default: 'draft',
      index: true,
    },
    entries: { type: [planEntrySchema], default: [] },
    obs: { type: String, default: '', trim: true },
  },
  {
    collection: 'localplans',
    assetType: ASSET_TYPE_LABELS.LOCALPLAN,
    kind: 'LOCALPLAN',
  }
);

localPlanSchema.index({ countyId: 1, surveyId: 1, updatedAt: -1 });
localPlanSchema.index({ instrumentResponseId: 1, status: 1 });
localPlanSchema.index({ deletedAt: 1, updatedAt: -1 });
localPlanSchema.index(
  { countyId: 1, surveyId: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, status: 'default' },
  }
);

module.exports = registerAssetModel('LocalPlan', localPlanSchema);
