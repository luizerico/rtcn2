const express = require('express');
const router = express.Router();
const { protect, requireAdmin } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { paramObjectId } = require('../validation/schemas');
const { listBin, restoreItem, purgeItem, empty } = require('../controllers/recycleBinController');

router.use(protect);
router.use(requireAdmin);

router.get('/', listBin);
router.delete('/', empty);
router.post('/:itemType/:id/restore', validate(paramObjectId('id', 'Item id')), restoreItem);
router.delete('/:itemType/:id', validate(paramObjectId('id', 'Item id')), purgeItem);

module.exports = router;
