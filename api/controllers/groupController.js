const Group = require('../models/Group');
const User = require('../models/User');

// @description @summary Get all groups (for admin view)
exports.getAllGroups = async (req, res) => {
    try {
        const groups = await Group.find({});
        res.status(200).json(groups);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching groups', error });
    }
};

// @description @summary Create a new group
exports.createGroup = async (req, res) => {
    // Assumes the request body contains necessary fields like name and description
    try {
        const { name, description } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Group name is required.' });
        }
        
        // The actual creation logic should handle ownership/creation rights checks
        const newGroup = await Group.create({ name, description });
        res.status(201).json(newGroup);

    } catch (error) {
        res.status(500).json({ message: 'Error creating group', error });
    }
};

// @description @summary Get a single group by ID
exports.getGroupById = async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found.' });
        }
        res.status(200).json(group);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching group', error });
    }
};

// @description @summary Update an existing group
exports.updateGroup = async (req, res) => {
    try {
        const updatedGroup = await Group.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true }
        );

        if (!updatedGroup) {
             return res.status(404).json({ message: 'Group not found.' });
        }
        res.status(200).json(updatedGroup);

    } catch (error) {
        res.status(500).json({ message: 'Error updating group', error });
    }
};

// @description @summary Delete a group by ID
exports.deleteGroup = async (req, res) => {
    try {
        const group = await Group.findByIdAndDelete(req.params.id);

        if (!group) {
            return res.status(404).json({ message: 'Group not found.' });
        }
        res.status(200).json({ message: 'Group deleted successfully.' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting group', error });
    }
};