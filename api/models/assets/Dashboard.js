const { createAssetSchema, registerAssetModel } = require('../Asset');
const { ASSET_TYPE_LABELS } = require('../../constants/assetTypes');

const dashboardSchema = createAssetSchema(
  {},
  {
    collection: 'dashboards',
    assetType: ASSET_TYPE_LABELS.DASHBOARD,
    kind: 'DASHBOARD',
  }
);

module.exports = registerAssetModel('Dashboard', dashboardSchema);
