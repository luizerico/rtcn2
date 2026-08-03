const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { ASSET_KINDS } = require('../constants/assetTypes');

/**
 * Base Asset. Subclasses are registered as Mongoose discriminators in separate files.
 * Collection: `assets`
 */
const assetSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    description: { type: String, default: '' },
    kind: {
      type: String,
      enum: ASSET_KINDS,
      default: 'DOCUMENT',
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    discriminatorKey: 'assetType',
    collection: 'assets',
  }
);

assetSchema.index({ assetType: 1, createdAt: -1 });

const Asset = mongoose.models.Asset || mongoose.model('Asset', assetSchema);

module.exports = {
  Asset,
  assetSchema,
};
