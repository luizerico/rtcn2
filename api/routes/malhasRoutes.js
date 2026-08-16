const express = require('express');
const { protect, requireAdmin } = require('../middleware/authMiddleware');
const { getMalha, getMalhaStats, syncMalhas } = require('../controllers/malhasController');

const router = express.Router();
router.use(protect);
router.get('/stats', requireAdmin, getMalhaStats);
router.post('/sync', requireAdmin, syncMalhas);
router.get('/:kind/:code', getMalha);

module.exports = router;
