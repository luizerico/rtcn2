const { createAssetSchema, registerAssetModel } = require('../Asset');
const { ASSET_TYPE_LABELS } = require('../../constants/assetTypes');

const datasetSchema = createAssetSchema(
  {},
  {
    collection: 'datasets',
    assetType: ASSET_TYPE_LABELS.DATASET,
    kind: 'DATASET',
  }
);

module.exports = registerAssetModel('Dataset', datasetSchema);
