const express = require('express');
const router = express.Router();
const {
  listSponsors,
  createSponsor,
  getSponsorById,
  updateSponsor,
  deleteSponsor,
} = require('../controllers/sponsorController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { paramObjectId } = require('../validation/schemas');

router.use(protect);

router.get(
  '/',
  authorize('SPONSOR:READ', { allowAnyInstance: true, attachAccessible: true }),
  listSponsors
);
router.post('/', authorize('SPONSOR:CREATE', { classWideOnly: true }), createSponsor);
router.get(
  '/:id',
  validate(paramObjectId('id', 'Sponsor id')),
  authorize('SPONSOR:READ', { param: 'id' }),
  getSponsorById
);
router.put(
  '/:id',
  validate(paramObjectId('id', 'Sponsor id')),
  authorize('SPONSOR:WRITE', { param: 'id' }),
  updateSponsor
);
router.delete(
  '/:id',
  validate(paramObjectId('id', 'Sponsor id')),
  authorize('SPONSOR:DELETE', { param: 'id' }),
  deleteSponsor
);

module.exports = router;
