const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { trashFields } = require('../services/trash');

const OWNER_TYPES = ['opportunity', 'project', 'sponsor', 'instrument_response'];
const STORAGE_DRIVERS = ['tmp', 'azure', 'aws', 'gcs'];

/**
 * Metadata for a binary stored via the pluggable file storage service.
 * Not an RBAC asset kind — access follows the parent owner record.
 */
const storedFileSchema = new Schema(
  {
    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    storedName: { type: String, required: true, trim: true, maxlength: 255 },
    displayName: { type: String, required: true, trim: true, maxlength: 255 },
    mimeType: { type: String, required: true, trim: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    sha256: { type: String, required: true, trim: true },
    ownerType: { type: String, required: true, enum: OWNER_TYPES, index: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    obs: { type: String, default: '', trim: true, maxlength: 2000 },
    /** Optional survey question id when the owner is an instrument response. */
    questionId: { type: String, default: null, trim: true, maxlength: 64, index: true },
    storageDriver: { type: String, required: true, enum: STORAGE_DRIVERS },
    storageKey: { type: String, required: true, trim: true },
    analysis: {
      jobId: { type: String, default: null, trim: true, maxlength: 64 },
      status: { type: String, default: null, trim: true, maxlength: 32 },
      result: { type: String, default: null, maxlength: 50000 },
      error: { type: String, default: null, trim: true, maxlength: 2000 },
      model: { type: String, default: null, trim: true, maxlength: 128 },
      requestedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
    },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    ownerLabel: { type: String, default: '', trim: true, maxlength: 255 },
    ...trashFields,
  },
  { timestamps: true, collection: 'stored_files' }
);

storedFileSchema.index({ ownerType: 1, ownerId: 1, deletedAt: 1, createdAt: -1 });
storedFileSchema.index({ ownerType: 1, ownerId: 1, questionId: 1, deletedAt: 1 });
storedFileSchema.index({ sha256: 1 });

module.exports = mongoose.models.StoredFile || mongoose.model('StoredFile', storedFileSchema);
module.exports.OWNER_TYPES = OWNER_TYPES;
module.exports.STORAGE_DRIVERS = STORAGE_DRIVERS;
