const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SYNC_SOURCES = [
  'malhas',
  'pib',
  'pam',
  'ppm',
  'cempre',
  'pia',
  'munic',
  's2id',
  'siconfi',
  'transfers',
  'emendas',
];
const SYNC_STATUSES = ['idle', 'syncing', 'up_to_date', 'updated', 'failed'];

const geoSyncStateSchema = new Schema(
  {
    source: { type: String, required: true, enum: SYNC_SOURCES, unique: true },
    status: { type: String, required: true, enum: SYNC_STATUSES, default: 'idle' },
    lastSyncedAt: { type: Date },
    lastSuccessAt: { type: Date },
    originPeriod: { type: String, trim: true, default: '' },
    originUpdatedAt: { type: Date },
    originFingerprint: { type: String, trim: true, default: '' },
    rowCount: { type: Number, default: 0 },
    lastError: { type: String, trim: true, default: '' },
  },
  { timestamps: true, collection: 'geo_sync_state' }
);

module.exports = mongoose.models.GeoSyncState || mongoose.model('GeoSyncState', geoSyncStateSchema);
module.exports.SYNC_SOURCES = SYNC_SOURCES;
module.exports.SYNC_STATUSES = SYNC_STATUSES;
