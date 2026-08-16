const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const geoDisasterSchema = new Schema(
  {
    sourceId: { type: String, required: true, trim: true, unique: true },
    county: { type: Schema.Types.ObjectId, ref: 'County', index: true },
    ibgeId: { type: String, required: true, trim: true, index: true },
    occurredAt: { type: Date, index: true },
    cobrade: { type: String, trim: true, default: '' },
    typeLabel: { type: String, trim: true, default: '' },
    recognition: {
      type: String,
      enum: ['none', 'emergency', 'calamity'],
      default: 'none',
    },
    affectedPeople: { type: Number },
    damages: { type: Number },
    raw: { type: Schema.Types.Mixed },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'geo_disasters' }
);

geoDisasterSchema.index({ county: 1, occurredAt: -1 });
geoDisasterSchema.index({ ibgeId: 1, occurredAt: -1 });

module.exports = mongoose.models.GeoDisaster || mongoose.model('GeoDisaster', geoDisasterSchema);
