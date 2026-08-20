const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const {
  MATCH_MODES,
  RUN_STATUSES,
  STEP_STATUSES,
  DIMENSION_KEYS,
  RAW_RESULT_MAX,
} = require('../constants/opportunityMatch');

const dimensionScoreSchema = new Schema(
  {
    score: { type: Number, default: 0, min: 0, max: 10 },
    note: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const matchedCodeSchema = new Schema(
  {
    code: { type: String, default: '', trim: true, maxlength: 64 },
    area: { type: String, default: '', trim: true, maxlength: 32 },
    questionId: { type: String, default: '', trim: true, maxlength: 64 },
    todo: { type: String, default: '', trim: true, maxlength: 2000 },
    proposedScore: { type: Number, default: null },
    technicalPriority: { type: Number, default: null },
    governmentPriority: { type: Number, default: null },
    reason: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const gradeSnapshotSchema = new Schema(
  {
    letter: { type: String, default: '', trim: true, maxlength: 8 },
    percent: { type: Number, default: null },
    total: { type: Number, default: null },
    maxTotal: { type: Number, default: null },
    byArea: { type: Schema.Types.Mixed, default: {} },
    surveyId: { type: String, default: '', trim: true },
    surveyName: { type: String, default: '', trim: true, maxlength: 255 },
  },
  { _id: false }
);

function emptyDimensions() {
  return Object.fromEntries(DIMENSION_KEYS.map((key) => [key, { score: 0, note: '' }]));
}

const dimensionsSchema = new Schema(
  Object.fromEntries(DIMENSION_KEYS.map((key) => [key, { type: dimensionScoreSchema, default: () => ({ score: 0, note: '' }) }])),
  { _id: false }
);

const matchCountySchema = new Schema(
  {
    opportunityId: { type: Schema.Types.ObjectId, ref: 'Opportunity', required: true, index: true },
    countyId: { type: Schema.Types.ObjectId, ref: 'County', required: true, index: true },
    countyName: { type: String, default: '', trim: true },
    IBGECode: { type: String, default: '', trim: true },
    gradeBefore: { type: gradeSnapshotSchema, default: () => ({}) },
    gradeAfter: { type: gradeSnapshotSchema, default: () => ({}) },
    matchedCodes: { type: [matchedCodeSchema], default: [] },
    dimensions: { type: dimensionsSchema, default: emptyDimensions },
    overallScore: { type: Number, default: 0, min: 0, max: 100 },
    rationale: { type: String, default: '', trim: true, maxlength: 4000 },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
  },
  { _id: false }
);

const matchStepSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 128 },
    kind: { type: String, enum: ['profile', 'match'], required: true },
    opportunityId: { type: Schema.Types.ObjectId, ref: 'Opportunity', required: true },
    batchIndex: { type: Number, default: 0, min: 0 },
    jobId: { type: String, default: '', trim: true, maxlength: 64 },
    status: { type: String, enum: STEP_STATUSES, default: 'pending' },
    storageKey: { type: String, default: '', trim: true, maxlength: 512 },
    storageDriver: { type: String, default: '', trim: true, maxlength: 32 },
    prompt: { type: String, default: '', maxlength: 8000 },
    request: { type: Schema.Types.Mixed, default: null },
    requestPayload: { type: Schema.Types.Mixed, default: null },
    rawResult: { type: String, default: '', maxlength: RAW_RESULT_MAX },
    error: { type: String, default: '', trim: true, maxlength: 2000 },
    profile: { type: Schema.Types.Mixed, default: null },
    countyIds: [{ type: Schema.Types.ObjectId, ref: 'County' }],
  },
  { _id: true }
);

const opportunityMatchRunSchema = new Schema(
  {
    opportunityIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Opportunity' }],
      required: true,
      index: true,
    },
    mode: { type: String, enum: MATCH_MODES, required: true },
    status: { type: String, enum: RUN_STATUSES, default: 'queued', index: true },
    error: { type: String, default: '', trim: true, maxlength: 2000 },
    promptSnapshot: { type: Schema.Types.Mixed, default: {} },
    opportunityProfiles: { type: Schema.Types.Mixed, default: {} },
    candidateCount: { type: Number, default: 0, min: 0 },
    steps: { type: [matchStepSchema], default: [] },
    matches: { type: [matchCountySchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true, collection: 'opportunity_match_runs' }
);

opportunityMatchRunSchema.index({ opportunityIds: 1, createdAt: -1 });
opportunityMatchRunSchema.index({ createdBy: 1, createdAt: -1 });

module.exports =
  mongoose.models.OpportunityMatchRun ||
  mongoose.model('OpportunityMatchRun', opportunityMatchRunSchema);
