const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const GEO_KINDS = ['county', 'state', 'region'];
const AMENDMENT_TYPES = ['individual', 'bancada', 'comissao', 'relator', 'other'];

const geoAmendmentSchema = new Schema(
  {
    sourceId: { type: String, required: true, trim: true, unique: true },
    kind: { type: String, required: true, enum: GEO_KINDS, index: true },
    subjectId: { type: Schema.Types.ObjectId, required: true, index: true },
    ibgeId: { type: String, required: true, trim: true, index: true },
    county: { type: Schema.Types.ObjectId, ref: 'County', index: true },
    state: { type: Schema.Types.ObjectId, ref: 'State', index: true },
    region: { type: Schema.Types.ObjectId, ref: 'Region', index: true },
    year: { type: Number, required: true, index: true },
    code: { type: String, trim: true, default: '' },
    author: { type: String, trim: true, default: '' },
    authorType: { type: String, trim: true, default: '' },
    amendmentType: {
      type: String,
      enum: AMENDMENT_TYPES,
      default: 'other',
      index: true,
    },
    function: { type: String, trim: true, default: '' },
    subfunction: { type: String, trim: true, default: '' },
    grupo: { type: String, trim: true, default: '' },
    purpose: { type: String, trim: true, default: '' },
    action: { type: String, trim: true, default: '' },
    target: { type: String, trim: true, default: '' },
    targetCode: { type: String, trim: true, default: '' },
    targetType: { type: String, trim: true, default: '' },
    committed: { type: Number },
    paid: { type: Number },
    empenhado: { type: Number },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'geo_amendments' }
);

geoAmendmentSchema.index({ kind: 1, subjectId: 1, year: -1 });
geoAmendmentSchema.index({ county: 1, year: -1 });
geoAmendmentSchema.index({ state: 1, year: -1 });
geoAmendmentSchema.index({ region: 1, year: -1 });

module.exports = mongoose.models.GeoAmendment || mongoose.model('GeoAmendment', geoAmendmentSchema);
module.exports.GEO_KINDS = GEO_KINDS;
module.exports.AMENDMENT_TYPES = AMENDMENT_TYPES;
