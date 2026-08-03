const Group = require('../models/Group');
const Permission = require('../models/Permission');
const User = require('../models/User');

exports.getAllGroups = async (req, res) => {
  try {
    const groups = await Group.find({});
    res.status(200).json(groups);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching groups', error: error.message });
  }
};

exports.createGroup = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Group name is required.' });
    }

    const existing = await Group.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: 'Group name already exists.' });
    }

    const newGroup = await Group.create({ name, description });
    res.status(201).json(newGroup);
  } catch (error) {
    res.status(500).json({ message: 'Error creating group', error: error.message });
  }
};

exports.getGroupById = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }
    res.status(200).json(group);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching group', error: error.message });
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const updatedGroup = await Group.findByIdAndUpdate(req.params.id, req.body, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!updatedGroup) {
      return res.status(404).json({ message: 'Group not found.' });
    }
    res.status(200).json(updatedGroup);
  } catch (error) {
    res.status(500).json({ message: 'Error updating group', error: error.message });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const groupId = req.params.id;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
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
    res.status(500).json({ message: 'Error deleting group', error: error.message });
  }
};
