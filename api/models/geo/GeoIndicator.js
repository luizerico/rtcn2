const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const GEO_KINDS = ['county', 'state', 'region'];
const GEO_SOURCES = ['pib', 'pam', 'ppm', 'cempre', 'pia', 'munic', 'siconfi', 'transfers', 'emendas'];

const geoIndicatorSchema = new Schema(
  {
    kind: { type: String, required: true, enum: GEO_KINDS, index: true },
    subjectId: { type: Schema.Types.ObjectId, required: true, index: true },
    ibgeId: { type: String, required: true, trim: true, index: true },
    source: { type: String, required: true, enum: GEO_SOURCES, index: true },
    series: { type: String, required: true, trim: true, index: true },
    year: { type: Number, required: true, index: true },
    value: { type: Number, required: true },
    unit: { type: String, trim: true, default: '' },
    categoryId: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: '' },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'geo_indicators' }
);

geoIndicatorSchema.index(
  { kind: 1, ibgeId: 1, source: 1, series: 1, year: 1, categoryId: 1 },
  { unique: true }
);
geoIndicatorSchema.index({ kind: 1, subjectId: 1, source: 1, year: -1 });

module.exports = mongoose.models.GeoIndicator || mongoose.model('GeoIndicator', geoIndicatorSchema);
module.exports.GEO_KINDS = GEO_KINDS;
module.exports.GEO_SOURCES = GEO_SOURCES;
