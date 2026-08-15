const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const microRegionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, required: false },
    region: { type: Schema.Types.ObjectId, ref: 'Region', required: true, index: true },
    state: { type: Schema.Types.ObjectId, ref: 'State', required: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: 'microregions' }
);

microRegionSchema.index({ region: 1, state: 1, name: 1 });
microRegionSchema.index({ code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.MicroRegion || mongoose.model('MicroRegion', microRegionSchema);
