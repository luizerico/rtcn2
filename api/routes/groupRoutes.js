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
} = require('../controllers/groupMembershipController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', authorize('GROUP:READ'), getAllGroups);
router.post('/', authorize('GROUP:CREATE'), createGroup);

router.post('/:groupId/members', authorize('GROUP:WRITE'), addMemberToGroup);
router.delete('/:groupId/members', authorize('GROUP:WRITE'), removeMemberFromGroup);
router.post('/:groupId/permissions', authorize('GROUP:WRITE'), updateGroupPermissions);

router.get('/:id', authorize('GROUP:READ'), getGroupById);
router.put('/:id', authorize('GROUP:WRITE'), updateGroup);
router.delete('/:id', authorize('GROUP:DELETE'), deleteGroup);

module.exports = router;
