const express = require('express');
const router = express.Router();
const { protect, requireAdmin } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { paramObjectId } = require('../validation/schemas');
const {
  getFile,
  downloadFile,
  updateFile,
  removeFile,
  listBin,
  restoreBinFile,
  purgeBinFile,
  emptyBin,
  downloadBinFile,
} = require('../controllers/storedFileController');

router.use(protect);

router.get('/bin', requireAdmin, listBin);
router.delete('/bin', requireAdmin, emptyBin);
router.get(
  '/bin/:id/content',
  requireAdmin,
  validate(paramObjectId('id', 'File id')),
  downloadBinFile
);
router.post(
  '/bin/:id/restore',
  requireAdmin,
  validate(paramObjectId('id', 'File id')),
  restoreBinFile
);
router.delete('/bin/:id', requireAdmin, validate(paramObjectId('id', 'File id')), purgeBinFile);

router.get('/:id/content', validate(paramObjectId('id', 'File id')), downloadFile);
router.get('/:id', validate(paramObjectId('id', 'File id')), getFile);
router.patch('/:id', validate(paramObjectId('id', 'File id')), updateFile);
router.delete('/:id', validate(paramObjectId('id', 'File id')), removeFile);

module.exports = router;
