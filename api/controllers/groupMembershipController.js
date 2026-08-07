const Group = require('../models/Group');
const User = require('../models/User');
const {
  listGroupPermissions,
  replaceGroupClassPermissions,
} = require('../services/rbacService');

exports.addMemberToGroup = async (req, res) => {
  try {
    const targetUserId = req.validated?.targetUserId || req.body.targetUserId;

    const user = await User.findById(targetUserId);
    if (!user) {
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND);
    }

    const updatedGroup = await Group.findByIdAndUpdate(
      req.params.groupId,
      { $addToSet: { members: targetUserId } },
      { returnDocument: 'after' }
    );

    if (!updatedGroup) {
      return sendError(res, 404, 'Group not found.', ERROR_CODES.NOT_FOUND);
    }

    res.status(200).json({
      message: `User successfully added to group ${req.params.groupId}.`,
      group: updatedGroup,
    });
  } catch (error) {
    return sendServerError(res, error, 'Error adding member to group');
  }
};

exports.removeMemberFromGroup = async (req, res) => {
  try {
    const targetUserId = req.validated?.targetUserId || req.body.targetUserId;

    const updatedGroup = await Group.findByIdAndUpdate(
      req.params.groupId,
      { $pull: { members: targetUserId } },
      { returnDocument: 'after' }
    );

    if (!updatedGroup) {
      return sendError(res, 404, 'Group not found.', ERROR_CODES.NOT_FOUND);
    }

    res.status(200).json({
      message: `User successfully removed from group ${req.params.groupId}.`,
      group: updatedGroup,
    });
  } catch (error) {
    return sendServerError(res, error, 'Error removing member from group');
  }
};

exports.getGroupPermissions = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return sendError(res, 404, 'Group not found.', ERROR_CODES.NOT_FOUND);
    }

    const permissions = await listGroupPermissions(group._id);
    res.status(200).json({ groupId: group._id, permissions });
  } catch (error) {
    return sendServerError(res, error, 'Error fetching group permissions');
  }
};

/**
 * @deprecated Prefer POST /api/permissions/acl (applyAssetAcl). Kept for
 * backward compatibility; only mutates this group's grants for the selection.
 */
exports.updateGroupPermissions = async (req, res) => {
  res.set('Deprecation', 'true');
  res.set(
    'Link',
    '</api/permissions/acl>; rel="successor-version"; title="Canonical permission write API"'
  );
  res.set(
    'Warning',
    '299 - "POST /api/groups/{groupId}/permissions is deprecated; use POST /api/permissions/acl"'
  );

  try {
    const {
      scopes,
      resourceType,
      allObjects = false,
      objects = [],
    } = req.validated || req.body;

    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return sendError(res, 404, 'Group not found.', ERROR_CODES.NOT_FOUND);
    }

    const permissions = await replaceGroupClassPermissions({
      groupId: group._id,
      resourceType: String(resourceType || '').toUpperCase(),
      scopes,
      allObjects: Boolean(allObjects),
      objects: Array.isArray(objects) ? objects.filter((o) => o && (o.id || o.resourceId)) : [],
    });

    res.status(200).json({
      message:
        'Group permissions updated successfully. Deprecated: prefer POST /api/permissions/acl.',
      deprecated: true,
      successor: '/api/permissions/acl',
      group,
      permissions,
    });
  } catch (error) {
    return sendServerError(res, error, 'Error updating group permissions');
  }
};
