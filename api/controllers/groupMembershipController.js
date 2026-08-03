const Group = require('../models/Group');
const User = require('../models/User');
const { PERMISSION_RESOURCE_TYPES } = require('../constants/rbac');
const {
  listGroupPermissions,
  replaceGroupClassPermissions,
} = require('../services/rbacService');

exports.addMemberToGroup = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ message: 'Target User ID is required.' });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const updatedGroup = await Group.findByIdAndUpdate(
      req.params.groupId,
      { $addToSet: { members: targetUserId } },
      { returnDocument: 'after' }
    );

    if (!updatedGroup) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    res.status(200).json({
      message: `User successfully added to group ${req.params.groupId}.`,
      group: updatedGroup,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error adding member to group', error: error.message });
  }
};

exports.removeMemberFromGroup = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ message: 'Target User ID is required.' });
    }

    const updatedGroup = await Group.findByIdAndUpdate(
      req.params.groupId,
      { $pull: { members: targetUserId } },
      { returnDocument: 'after' }
    );

    if (!updatedGroup) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    res.status(200).json({
      message: `User successfully removed from group ${req.params.groupId}.`,
      group: updatedGroup,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error removing member from group', error: error.message });
  }
};

exports.getGroupPermissions = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    const permissions = await listGroupPermissions(group._id);
    res.status(200).json({ groupId: group._id, permissions });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching group permissions', error: error.message });
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
    const { scopes, resourceType, allObjects = false, objects = [] } = req.body;
    const allowedScopes = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN'];

    if (!Array.isArray(scopes) || scopes.length === 0) {
      return res.status(400).json({ message: 'At least one permission scope is required.' });
    }

    const normalizedResourceType = String(resourceType || '').toUpperCase();
    if (!PERMISSION_RESOURCE_TYPES.includes(normalizedResourceType)) {
      return res.status(400).json({
        message: `Invalid resource type. Permissions only apply to asset subclasses: ${PERMISSION_RESOURCE_TYPES.join(', ')}.`,
      });
    }

    const invalidScopes = scopes.filter((scope) => !allowedScopes.includes(scope));
    if (invalidScopes.length > 0) {
      return res.status(400).json({ message: `Invalid scopes: ${invalidScopes.join(', ')}` });
    }

    const selectedObjects = Array.isArray(objects)
      ? objects.filter((o) => o && (o.id || o.resourceId))
      : [];

    if (!allObjects && selectedObjects.length === 0) {
      return res.status(400).json({
        message: 'Select all objects of this class, or one or more existing database objects.',
      });
    }

    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    const permissions = await replaceGroupClassPermissions({
      groupId: group._id,
      resourceType: normalizedResourceType,
      scopes,
      allObjects: Boolean(allObjects),
      objects: selectedObjects,
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
    const status = /Select at least one asset/i.test(error.message) ? 400 : 500;
    res.status(status).json({ message: 'Error updating group permissions', error: error.message });
  }
};
