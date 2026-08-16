const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { createAssetSchema, registerAssetModel } = require('../Asset');
const { ASSET_TYPE_LABELS } = require('../../constants/assetTypes');
const { RELATED_ENTITY_TYPES, DEFAULT_CURRENCY } = require('../../constants/fundingTypes');

const projectSchema = createAssetSchema(
  {
    areas: [{ type: Schema.Types.ObjectId }],
    opportunity: {
      type: Schema.Types.ObjectId,
      ref: 'Opportunity',
      index: true,
    },
    relatedEntity: {
      entityId: [{ type: Schema.Types.ObjectId }],
      entityType: { type: String, enum: RELATED_ENTITY_TYPES },
    },
    projWebsite: { type: String, required: true, trim: true },
    projStartDate: { type: Date, required: true },
    projEndDate: { type: Date },
    projBudget: { type: Number, required: true },
    currency: { type: String, default: DEFAULT_CURRENCY, trim: true },
    projStatus: { type: String, required: true, trim: true },
    projComments: { type: [String], default: [] },
    projDocuments: { type: [String], default: [] },
    obs: { type: String, trim: true, default: '' },
  },
  {
    collection: 'projects',
    assetType: ASSET_TYPE_LABELS.PROJECT,
    kind: 'PROJECT',
  }
);

projectSchema.index({ name: 1 });
projectSchema.index({ projStatus: 1 });
projectSchema.index({ projStartDate: -1 });

module.exports = registerAssetModel('Project', projectSchema);
