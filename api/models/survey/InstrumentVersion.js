const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { QUESTION_TYPES } = require('../../constants/assetTypes');

/**
 * Frozen copy of survey questions at publish time. Immutable after insert.
 */
const versionItemSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    code: { type: String, required: true, trim: true },
    area: { type: String, default: '', trim: true },
    prompt: { type: String, required: true, trim: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: true },
    evidence: { type: String, default: '' },
    criteria: { type: String, default: '' },
    maxPoints: { type: Number, default: 0 },
    weight: { type: Number, default: 1 },
    todo: { type: String, default: '' },
    questionRevision: { type: Number, default: 1 },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const instrumentVersionSchema = new Schema(
  {
    instrumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Survey',
      required: true,
      index: true,
    },
    version: { type: Number, required: true, min: 1 },
    items: { type: [versionItemSchema], default: [] },
    publishedAt: { type: Date, required: true, default: Date.now },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'instrument_versions' }
);

instrumentVersionSchema.index({ instrumentId: 1, version: 1 }, { unique: true });

instrumentVersionSchema.pre('save', function () {
  if (!this.isNew) {
    throw new Error('Instrument versions are immutable after publish.');
  }
});

module.exports =
  mongoose.models.InstrumentVersion || mongoose.model('InstrumentVersion', instrumentVersionSchema);
