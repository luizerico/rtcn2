const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const stateSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    region: { type: Schema.Types.ObjectId, ref: 'Region', required: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: 'states' }
);

stateSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.models.State || mongoose.model('State', stateSchema);
