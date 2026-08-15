const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const countySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    IBGECode: { type: String, trim: true },
    contactName: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    contactFunction: { type: String, trim: true },
    location: {
      lat: { type: Number },
      long: { type: Number },
    },
    population: { type: Number },
    otherBiomas: [{ type: String, trim: true }],
    obs: { type: String, trim: true },
    state: { type: Schema.Types.ObjectId, ref: 'State', required: true, index: true },
    region: { type: Schema.Types.ObjectId, ref: 'Region', index: true },
    microregion: { type: Schema.Types.ObjectId, ref: 'MicroRegion', index: true },
    biome: { type: Schema.Types.ObjectId, ref: 'Biome', index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: 'counties' }
);

countySchema.index({ IBGECode: 1 }, { unique: true, sparse: true });
countySchema.index({ name: 1 });

module.exports = mongoose.models.County || mongoose.model('County', countySchema);
