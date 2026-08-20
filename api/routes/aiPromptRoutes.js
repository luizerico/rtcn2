const express = require('express');
const router = express.Router();
const { listAiPrompts, updateAiPrompts } = require('../controllers/opportunityMatchController');
const { protect, requireAdmin } = require('../middleware/authMiddleware');

router.use(protect, requireAdmin);

router.get('/', listAiPrompts);
router.put('/', updateAiPrompts);

module.exports = router;
