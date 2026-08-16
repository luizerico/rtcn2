const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const geoMalhaSchema = new Schema(
  {
    kind: { type: String, required: true, enum: ['county', 'state', 'region'] },
    ibgeId: { type: String, required: true, trim: true },
    geojson: { type: Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'geo_malhas' }
);

geoMalhaSchema.index({ kind: 1, ibgeId: 1 }, { unique: true });

module.exports = mongoose.models.GeoMalha || mongoose.model('GeoMalha', geoMalhaSchema);
