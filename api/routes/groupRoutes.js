const express = require('express');
const router = express.Router();
const {
  getAllGroups,
  createGroup,
  getGroupById,
  updateGroup,
  deleteGroup,
} = require('../controllers/groupController');
const {
  addMemberToGroup,
  removeMemberFromGroup,
  updateGroupPermissions,
  getGroupPermissions,
} = require('../controllers/groupMembershipController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const {
  createGroupBody,
  groupMemberBody,
  groupPermissionsBody,
  paramObjectId,
} = require('../validation/schemas');

router.use(protect);

router.get('/', authorize('GROUP:READ', { allowAnyInstance: true }), getAllGroups);
router.post(
  '/',
  authorize('GROUP:CREATE', { classWideOnly: true }),
  validate(createGroupBody),
  createGroup
);

router.post(
  '/:groupId/members',
  validate(groupMemberBody),
  authorize('GROUP:WRITE', { param: 'groupId' }),
  addMemberToGroup
);
router.delete(
  '/:groupId/members',
  validate(groupMemberBody),
  authorize('GROUP:WRITE', { param: 'groupId' }),
  removeMemberFromGroup
);
router.get(
  '/:groupId/permissions',
  validate(paramObjectId('groupId', 'Group id')),
  authorize('GROUP:READ', { param: 'groupId' }),
  getGroupPermissions
);
router.post(
  '/:groupId/permissions',
  validate(groupPermissionsBody),
  authorize('GROUP:WRITE', { param: 'groupId' }),
  updateGroupPermissions
);

router.get(
  '/:id',
  validate(paramObjectId('id', 'Group id')),
  authorize('GROUP:READ', { param: 'id' }),
  getGroupById
);
router.put(
  '/:id',
  validate(paramObjectId('id', 'Group id')),
  authorize('GROUP:WRITE', { param: 'id' }),
  updateGroup
);
router.delete(
  '/:id',
  validate(paramObjectId('id', 'Group id')),
  authorize('GROUP:DELETE', { param: 'id' }),
  deleteGroup
);

module.exports = router;
