const Group = require('../models/Group');
const User = require('../models/User');
const {
  listGroupPermissions,
  replaceGroupTargetPermissions,
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

exports.updateGroupPermissions = async (req, res) => {
  try {
    const { scopes, target, resourceType } = req.body;
    const allowedScopes = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN'];
    const allowedResourceTypes = ['USER', 'GROUP', 'OBJECT'];

    if (!Array.isArray(scopes) || scopes.length === 0) {
      return res.status(400).json({ message: 'At least one permission scope is required.' });
    }

    if (!target || typeof target !== 'string') {
      return res.status(400).json({ message: 'Target resource is required.' });
    }

    const normalizedResourceType = String(resourceType || 'OBJECT').toUpperCase();
    if (!allowedResourceTypes.includes(normalizedResourceType)) {
      return res.status(400).json({ message: 'Invalid resource type.' });
    }

    const invalidScopes = scopes.filter((scope) => !allowedScopes.includes(scope));
    if (invalidScopes.length > 0) {
      return res.status(400).json({ message: `Invalid scopes: ${invalidScopes.join(', ')}` });
    }

    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    const permissions = await replaceGroupTargetPermissions({
      groupId: group._id,
      resourceType: normalizedResourceType,
      target,
      scopes,
    });

    res.status(200).json({
      message: 'Group permissions updated successfully.',
      group,
      permissions,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating group permissions', error: error.message });
  }
};
