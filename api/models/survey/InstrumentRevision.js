const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Immutable snapshot of an InstrumentResponse after each save.
 */
const instrumentRevisionSchema = new Schema(
  {
    responseId: {
      type: Schema.Types.ObjectId,
      ref: 'InstrumentResponse',
      required: true,
      index: true,
    },
    revision: { type: Number, required: true, min: 1 },
    snapshot: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false, collection: 'instrument_revisions' }
);

instrumentRevisionSchema.index({ responseId: 1, revision: 1 }, { unique: true });

module.exports =
  mongoose.models.InstrumentRevision ||
  mongoose.model('InstrumentRevision', instrumentRevisionSchema);
