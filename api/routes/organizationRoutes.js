const express = require('express');
const router = express.Router();
const {
  getAllOrganizations,
  createOrganization,
  getOrganizationById,
  updateOrganization,
  deleteOrganization,
} = require('../controllers/organizationController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const {
  createOrganizationBody,
  updateOrganizationBody,
  paramObjectId,
} = require('../validation/schemas');

router.use(protect);

router.get('/', authorize('ORGANIZATION:READ', { allowAnyInstance: true }), getAllOrganizations);
router.post(
  '/',
  authorize('ORGANIZATION:CREATE', { classWideOnly: true }),
  validate(createOrganizationBody),
  createOrganization
);
router.get(
  '/:id',
  validate(paramObjectId('id', 'Organization id')),
  authorize('ORGANIZATION:READ', { param: 'id' }),
  getOrganizationById
);
router.put(
  '/:id',
  validate(paramObjectId('id', 'Organization id')),
  authorize('ORGANIZATION:WRITE', { param: 'id' }),
  validate(updateOrganizationBody),
  updateOrganization
);
router.delete(
  '/:id',
  validate(paramObjectId('id', 'Organization id')),
  authorize('ORGANIZATION:DELETE', { param: 'id' }),
  deleteOrganization
);

module.exports = router;
