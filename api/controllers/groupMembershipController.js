const Group = require('../models/Group');
const User = require('../models/User');

/**
 * @description @summary Add user membership to a group
 */
exports.addMemberToGroup = async (req, res) => {
    try {
        // Expecting targetUserId and groupId in the body
        const { targetUserId } = req.body; 
        if (!targetUserId) {
            return res.status(400).json({ message: 'Target User ID is required.' });
        }

        // Logic to add user reference to Group model (assuming Group model has a structure for members)
        // For now, we simulate the update based on successful operation
        const updatedGroup = await Group.findByIdAndUpdate(
            req.params.groupId, 
            { $addToSet: { users: targetUserId } }, // Using MongoDB's atomic update operator
            { new: true }
        );

        if (!updatedGroup) {
             return res.status(404).json({ message: 'Group not found.' });
        }
        res.status(200).json({ 
            message: `User successfully added to group ${req.params.groupId}.`,
            group: updatedGroup
        });

    } catch (error) {
        res.status(500).json({ message: 'Error adding member to group', error });
    }
};

/**
 * @description @summary Remove user membership from a group
 */
exports.removeMemberFromGroup = async (req, res) => {
    try {
        // Expecting targetUserId and groupId in the body
        const { targetUserId } = req.body; 
        if (!targetUserId) {
            return res.status(400).json({ message: 'Target User ID is required.' });
        }

        // Use MongoDB's $pull operator to remove user from array
        const updatedGroup = await Group.findByIdAndUpdate(
            req.params.groupId, 
            { $pull: { users: targetUserId } }, 
            { new: true }
        );

        if (!updatedGroup) {
             return res.status(404).json({ message: 'Group not found.' });
        }
        res.status(200).json({ 
            message: `User successfully removed from group ${req.params.groupId}.`,
            group: updatedGroup
        });

    } catch (error) {
        res.status(500).json({ message: 'Error removing member from group', error });
    }
};