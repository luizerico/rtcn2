const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { SUBJECT_TYPES, RESPONSE_STATUSES } = require('../../constants/assetTypes');
const { trashFields } = require('../../services/trash');

const answerItemSchema = new Schema(
  {
    questionId: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    obs: { type: String, default: '', trim: true },
    evidenceFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile', default: null },
  },
  { _id: false }
);

const computedScoreSchema = new Schema(
  {
    total: { type: Number, default: 0 },
    maxTotal: { type: Number, default: 0 },
    percent: { type: Number, default: 0 },
    letter: { type: String, default: '' },
    byArea: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

/**
 * One current sheet per instrument + subject (a county cannot have two versions).
 * Viewing uses subject READ; starting a sheet uses SURVEY:READ + subject CREATE;
 * editing uses subject WRITE (or the owner while in_progress / need_changes).
 * Deleting uses subject DELETE (or the owner while in_progress / need_changes)
 * and moves the sheet to the recycle bin.
 * COUNTY subjects must be listed on the instrument's countyIds.
 */
const instrumentResponseSchema = new Schema(
  {
    instrumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Survey',
      required: true,
      index: true,
    },
    instrumentVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'InstrumentVersion',
      required: true,
      index: true,
    },
    subjectType: { type: String, enum: SUBJECT_TYPES, required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, enum: RESPONSE_STATUSES, default: 'in_progress' },
    answers: { type: [answerItemSchema], default: [] },
    revision: { type: Number, default: 1, min: 1 },
    computedScore: { type: computedScoreSchema, default: () => ({}) },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ...trashFields,
  },
  { timestamps: true, collection: 'instrument_responses' }
);

instrumentResponseSchema.index(
  { instrumentId: 1, subjectType: 1, subjectId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);

module.exports =
  mongoose.models.InstrumentResponse ||
  mongoose.model('InstrumentResponse', instrumentResponseSchema);
