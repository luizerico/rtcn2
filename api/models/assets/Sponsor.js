const { createAssetSchema, registerAssetModel } = require('../Asset');
const { ASSET_TYPE_LABELS } = require('../../constants/assetTypes');
const { SPONSOR_ORIGEM } = require('../../constants/fundingTypes');

const sponsorSchema = createAssetSchema(
  {
    orgEmail: { type: String, required: true, trim: true },
    origem: { type: String, required: true, enum: SPONSOR_ORIGEM },
    orgUnit: { type: String, trim: true, default: '' },
    webpage: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    socialMedia: { type: String, trim: true, default: '' },
    contact: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    zipCode: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    obs: { type: String, trim: true, default: '' },
  },
  {
    collection: 'sponsors',
    assetType: ASSET_TYPE_LABELS.SPONSOR,
    kind: 'SPONSOR',
  }
);

sponsorSchema.index({ name: 1 });
sponsorSchema.index({ origem: 1 });

module.exports = registerAssetModel('Sponsor', sponsorSchema);
