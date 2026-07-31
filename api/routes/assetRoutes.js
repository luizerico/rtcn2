const express = require('express');
const router = express.Router();
const {
  getAllAssets,
  createAsset,
  getAssetById,
  updateAsset,
  deleteAsset,
} = require('../controllers/assetController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', authorize('ASSET:READ'), getAllAssets);
router.post('/', authorize('ASSET:CREATE'), createAsset);
router.get('/:id', authorize('ASSET:READ'), getAssetById);
router.put('/:id', authorize('ASSET:WRITE'), updateAsset);
router.delete('/:id', authorize('ASSET:DELETE'), deleteAsset);

router.post('/:assetId/members', authorize('ASSET:WRITE'), (_req, res) => {
  res.status(501).json({ message: 'Asset membership updates are not implemented yet.' });
});

router.post('/:assetId/permissions', authorize('ASSET:WRITE'), (_req, res) => {
  res.status(501).json({ message: 'Asset permission updates are not implemented yet.' });
});

module.exports = router;
