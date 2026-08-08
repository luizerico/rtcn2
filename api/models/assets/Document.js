const { createAssetSchema, registerAssetModel } = require('../Asset');
const { ASSET_TYPE_LABELS } = require('../../constants/assetTypes');

const documentSchema = createAssetSchema(
  {},
  {
    collection: 'documents',
    assetType: ASSET_TYPE_LABELS.DOCUMENT,
    kind: 'DOCUMENT',
  }
);

module.exports = registerAssetModel('Document', documentSchema);
