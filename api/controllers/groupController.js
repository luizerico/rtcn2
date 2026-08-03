const Group = require('../models/Group');
const { sendServerError, sendError, ERROR_CODES } = require('../utils/httpErrors');

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
    const { name, description } = req.body;
    if (!name) {
      return sendError(res, 400, 'Group name is required.', ERROR_CODES.VALIDATION);
    }

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
    const updatedGroup = await Group.findByIdAndUpdate(req.params.id, req.body, {
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
    const group = await Group.findByIdAndDelete(req.params.id);

    if (!group) {
      return sendError(res, 404, 'Group not found.', ERROR_CODES.NOT_FOUND);
    }
    res.status(200).json({ message: 'Group deleted successfully.' });
  } catch (error) {
    return sendServerError(res, error, 'Error deleting group');
  }
};
