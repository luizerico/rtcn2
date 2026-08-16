const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { createAssetSchema, registerAssetModel } = require('../Asset');
const { ASSET_TYPE_LABELS } = require('../../constants/assetTypes');
const {
  OPPORTUNITY_TYPE,
  OPPORTUNITY_CATEGORY,
  OPPORTUNITY_ELIGIBILITY,
  DEFAULT_CURRENCY,
} = require('../../constants/fundingTypes');

const opportunitySchema = createAssetSchema(
  {
    sponsor: {
      type: Schema.Types.ObjectId,
      ref: 'Sponsor',
      required: true,
      index: true,
    },
    areas: [{ type: Schema.Types.ObjectId }],
    type: { type: String, required: true, enum: OPPORTUNITY_TYPE },
    category: { type: String, required: true, enum: OPPORTUNITY_CATEGORY },
    eligibility: { type: String, required: true, enum: OPPORTUNITY_ELIGIBILITY },
    website: { type: String, required: true, trim: true },
    submissionMethod: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    continuous: { type: Boolean, default: false },
    budget: { type: Number, required: true },
    totalBudget: { type: Number },
    currency: { type: String, default: DEFAULT_CURRENCY, trim: true },
    obs: { type: [String], default: [] },
    documents: { type: [String], default: [] },
  },
  {
    collection: 'opportunities',
    assetType: ASSET_TYPE_LABELS.OPPORTUNITY,
    kind: 'OPPORTUNITY',
  }
);

opportunitySchema.index({ name: 1 });
opportunitySchema.index({ startDate: -1 });

module.exports = registerAssetModel('Opportunity', opportunitySchema);
