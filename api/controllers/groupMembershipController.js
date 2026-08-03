const Group = require('../models/Group');
const User = require('../models/User');
const { PERMISSION_RESOURCE_TYPES } = require('../constants/rbac');
const { sendServerError, sendError, ERROR_CODES } = require('../utils/httpErrors');
const {
  listGroupPermissions,
  replaceGroupClassPermissions,
} = require('../services/rbacService');

exports.addMemberToGroup = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return sendError(res, 400, 'Target User ID is required.', ERROR_CODES.VALIDATION);
    }

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
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return sendError(res, 400, 'Target User ID is required.', ERROR_CODES.VALIDATION);
    }

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

exports.updateGroupPermissions = async (req, res) => {
  try {
    const { scopes, resourceType, allObjects = false, objects = [] } = req.body;
    const allowedScopes = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN'];

    if (!Array.isArray(scopes) || scopes.length === 0) {
      return sendError(res, 400, 'At least one permission scope is required.', ERROR_CODES.VALIDATION);
    }

    const normalizedResourceType = String(resourceType || '').toUpperCase();
    if (!PERMISSION_RESOURCE_TYPES.includes(normalizedResourceType)) {
      return sendError(res, 400, `Invalid resource type. Permissions only apply to asset subclasses: ${PERMISSION_RESOURCE_TYPES.join(', ')}.`, ERROR_CODES.VALIDATION);
    }

    const invalidScopes = scopes.filter((scope) => !allowedScopes.includes(scope));
    if (invalidScopes.length > 0) {
      return sendError(res, 400, `Invalid scopes: ${invalidScopes.join(', ')}`, ERROR_CODES.VALIDATION);
    }

    const selectedObjects = Array.isArray(objects)
      ? objects.filter((o) => o && (o.id || o.resourceId))
      : [];

    if (!allObjects && selectedObjects.length === 0) {
      return sendError(res, 400, 'Select all objects of this class, or one or more existing database objects.', ERROR_CODES.VALIDATION);
    }

    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return sendError(res, 404, 'Group not found.', ERROR_CODES.NOT_FOUND);
    }

    const permissions = await replaceGroupClassPermissions({
      groupId: group._id,
      resourceType: normalizedResourceType,
      scopes,
      allObjects: Boolean(allObjects),
      objects: selectedObjects,
    });

    res.status(200).json({
      message: 'Group permissions updated successfully.',
      group,
      permissions,
    });
  } catch (error) {
    return sendServerError(res, error, 'Error updating group permissions');
  }
};
