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

router.use(protect);

router.get('/', authorize('GROUP:READ', { allowAnyInstance: true }), getAllGroups);
router.post('/', authorize('GROUP:CREATE', { classWideOnly: true }), createGroup);

router.post('/:groupId/members', authorize('GROUP:WRITE', { param: 'groupId' }), addMemberToGroup);
router.delete('/:groupId/members', authorize('GROUP:WRITE', { param: 'groupId' }), removeMemberFromGroup);
router.get(
  '/:groupId/permissions',
  authorize('GROUP:READ', { param: 'groupId' }),
  getGroupPermissions
);
// Deprecated write path — canonical permission writes use POST /api/permissions/acl.
router.post(
  '/:groupId/permissions',
  authorize('GROUP:WRITE', { param: 'groupId' }),
  updateGroupPermissions
);

router.get('/:id', authorize('GROUP:READ', { param: 'id' }), getGroupById);
router.put('/:id', authorize('GROUP:WRITE', { param: 'id' }), updateGroup);
router.delete('/:id', authorize('GROUP:DELETE', { param: 'id' }), deleteGroup);

module.exports = router;
