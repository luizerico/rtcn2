const Group = require('../models/Group');
const Permission = require('../models/Permission');
const User = require('../models/User');
const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');

exports.getAllGroups = async (req, res) => {
  try {
    const groups = await Group.find({});
    res.status(200).json(groups);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching groups');
  }
};

exports.createGroup = async (req, res) => {
  try {
    const { name, description } = req.validated || req.body;

    const existing = await Group.findOne({ name });
    if (existing) {
      return sendError(res, 400, 'Group name already exists.', ERROR_CODES.CONFLICT);
    }

    const newGroup = await Group.create({ name, description });
    res.status(201).json(newGroup);
  } catch (error) {
    return sendServerError(res, error, 'Error creating group');
  }
};

exports.getGroupById = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return sendError(res, 404, 'Group not found.', ERROR_CODES.NOT_FOUND);
    }
    res.status(200).json(group);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching group');
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const GROUP_UPDATE_ALLOWED = ['name', 'description'];
    const updates = {};
    for (const key of GROUP_UPDATE_ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return sendError(
        res,
        400,
        `No updatable fields provided. Allowed: ${GROUP_UPDATE_ALLOWED.join(', ')}.`,
        ERROR_CODES.VALIDATION
      );
    }

    const updatedGroup = await Group.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!updatedGroup) {
      return sendError(res, 404, 'Group not found.', ERROR_CODES.NOT_FOUND);
    }
    res.status(200).json(updatedGroup);
  } catch (error) {
    return sendServerError(res, error, 'Error updating group');
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const groupId = req.params.id;
    const group = await Group.findById(groupId);

    if (!group) {
      return sendError(res, 404, 'Group not found.', ERROR_CODES.NOT_FOUND);
    }

    // Remove ACL rows for this group (modern principal + legacy groupId).
    await Permission.deleteMany({
      $or: [{ principalType: 'GROUP', principalId: groupId }, { groupId }],
    });
    // Clear users that still point at this group as their role.
    await User.updateMany({ roleId: groupId }, { $set: { roleId: null } });
    await Group.findByIdAndDelete(groupId);

    res.status(200).json({ message: 'Group deleted successfully.' });
  } catch (error) {
    return sendServerError(res, error, 'Error deleting group');
  }
};
