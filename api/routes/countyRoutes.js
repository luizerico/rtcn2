const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { paramObjectId } = require('../validation/schemas');
const { listCounties, getCountyById, listCountyEmissions } = require('../controllers/countyController');

const router = express.Router();
router.use(protect);

router.get('/', listCounties);
router.get(
  '/:id/emissions',
  validate(paramObjectId('id', 'County id')),
  listCountyEmissions
);
router.get('/:id', validate(paramObjectId('id', 'County id')), getCountyById);

module.exports = router;
