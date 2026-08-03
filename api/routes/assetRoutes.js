const express = require('express');
const router = express.Router();
const {
  getAllAssets,
  createAsset,
  getAssetById,
  updateAsset,
  deleteAsset,
} = require('../controllers/assetController');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { createAssetBody, paramObjectId } = require('../validation/schemas');
const { userHasPermission } = require('../services/rbacService');
const { Asset } = require('../models/Asset');
const { ASSET_KINDS } = require('../constants/rbac');

function forbid(res, permission) {
  return res.status(403).json({
    message: `Forbidden: Insufficient permissions for ${permission}.`,
    code: 'FORBIDDEN',
  });
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
      return res.status(404).json({ message: 'Asset not found.' });
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

router.post(
  '/',
  validate(createAssetBody),
  async (req, res, next) => {
    const kind = req.validated?.kind || String(req.body.kind || 'DOCUMENT').toUpperCase();
    if (!(await userHasPermission(req.user, `${kind}:CREATE`, {}))) {
      return forbid(res, `${kind}:CREATE`);
    }
    return next();
  },
  createAsset
);

router.get('/:id', validate(paramObjectId('id', 'Asset id')), authorizeAssetById('READ'), getAssetById);
router.put('/:id', validate(paramObjectId('id', 'Asset id')), authorizeAssetById('WRITE'), updateAsset);
router.delete(
  '/:id',
  validate(paramObjectId('id', 'Asset id')),
  authorizeAssetById('DELETE'),
  deleteAsset
);

module.exports = router;
