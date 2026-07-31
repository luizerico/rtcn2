const Permission = require('../models/Permission');
const Group = require('../models/Group');
const { listAllPermissions } = require('../services/rbacService');

exports.listPermissions = async (_req, res) => {
  try {
    const permissions = await listAllPermissions();
    res.status(200).json(permissions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching permissions', error: error.message });
  }
};

exports.listPermissionsByGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    const permissions = await Permission.find({ groupId: group._id }).sort({
      resourceType: 1,
      target: 1,
      permission: 1,
    });

    res.status(200).json({
      groupId: group._id,
      groupName: group.name,
      permissions,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching group permissions', error: error.message });
  }
};
