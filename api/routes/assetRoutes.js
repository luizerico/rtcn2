const express = require('express');
const { sendError, ERROR_CODES } = require('../utils/httpErrors');
const router = express.Router();
const {
  getAllAssets,
  createAsset,
  getAssetById,
  updateAsset,
  deleteAsset,
} = require('../controllers/assetController');
const { protect } = require('../middleware/authMiddleware');
const { userHasPermission } = require('../services/rbacService');
const { Asset } = require('../models/Asset');
const { ASSET_KINDS } = require('../constants/rbac');

function forbid(res, permission) {
  return sendError(
    res,
    403,
    `Forbidden: Insufficient permissions for ${permission}.`,
    ERROR_CODES.FORBIDDEN
  );
}

function authorizeAnyAssetKind(action, { allowAnyInstance = false } = {}) {
  return async (req, res, next) => {
    for (const kind of ASSET_KINDS) {
      if (await userHasPermission(req.user, `${kind}:${action}`, { allowAnyInstance })) {
        return next();
      }
    }
    return forbid(res, `asset:${action}`);
  };
}

function authorizeAssetById(action) {
  return async (req, res, next) => {
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return sendError(res, 404, 'Asset not found.', ERROR_CODES.NOT_FOUND);
    }
    req.asset = asset;
    const kind = String(asset.kind || 'DOCUMENT').toUpperCase();
    if (!(await userHasPermission(req.user, `${kind}:${action}`, { resourceId: asset._id }))) {
      return forbid(res, `${kind}:${action}`);
    }
    return next();
  };
}

router.use(protect);

router.get('/', authorizeAnyAssetKind('READ', { allowAnyInstance: true }), getAllAssets);

router.post('/', async (req, res, next) => {
  const kind = String(req.body.kind || 'DOCUMENT').toUpperCase();
  if (['SURVEY', 'SURVEY_RESPONSE'].includes(kind)) {
    return next();
  }
  if (!ASSET_KINDS.includes(kind)) {
    return sendError(res, 400, 'Invalid asset kind.', ERROR_CODES.VALIDATION);
  }
  if (!(await userHasPermission(req.user, `${kind}:CREATE`, {}))) {
    return forbid(res, `${kind}:CREATE`);
  }
  return next();
}, createAsset);

router.get('/:id', authorizeAssetById('READ'), getAssetById);
router.put('/:id', authorizeAssetById('WRITE'), updateAsset);
router.delete('/:id', authorizeAssetById('DELETE'), deleteAsset);

module.exports = router;
