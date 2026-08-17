const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { ASSET_KINDS, ASSET_TYPE_LABELS } = require('../constants/assetTypes');
const { trashFields } = require('../services/trash');

/**
 * Abstract Asset superclass — shared fields only. Not persisted.
 * Concrete subclasses register their own models/collections via createAssetSchema.
 */

const assetBaseFields = {
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
    required: true,
    index: true,
  },
  assetType: {
    type: String,
    required: true,
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
  ...trashFields,
};

/**
 * Build a concrete asset schema with shared fields plus subclass fields.
 * @param {Record<string, unknown>} extraFields
 * @param {{ collection: string, assetType: string, kind?: string }} options
 */
function createAssetSchema(extraFields = {}, options = {}) {
  const { collection, assetType, kind } = options;
  if (!collection) {
    throw new Error('createAssetSchema requires options.collection');
  }
  if (!assetType) {
    throw new Error('createAssetSchema requires options.assetType');
  }

  const resolvedKind =
    kind ||
    Object.keys(ASSET_TYPE_LABELS).find((k) => ASSET_TYPE_LABELS[k] === assetType) ||
    undefined;

  const fields = {
    ...assetBaseFields,
    assetType: { type: String, required: true, default: assetType },
    ...extraFields,
  };

  if (resolvedKind) {
    fields.kind = {
      type: String,
      enum: ASSET_KINDS,
      required: true,
      default: resolvedKind,
      index: true,
    };
  }

  const schema = new Schema(fields, {
    timestamps: true,
    collection,
  });

  schema.index({ createdAt: -1 });
  schema.index({ deletedAt: 1, createdAt: -1 });
  return schema;
}

/**
 * Register (or reuse) a concrete asset model.
 * @param {string} modelName
 * @param {import('mongoose').Schema} schema
 */
function registerAssetModel(modelName, schema) {
  return mongoose.models[modelName] || mongoose.model(modelName, schema);
}

module.exports = {
  assetBaseFields,
  createAssetSchema,
  registerAssetModel,
  ASSET_TYPE_LABELS,
};
