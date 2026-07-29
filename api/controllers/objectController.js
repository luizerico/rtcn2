const ObjectModel = require('../models/ObjectModel');
const { protect, authorize } = require('../middleware/authMiddleware'); // Need to ensure middleware is available here

/**
 * @description @summary Get all objects (for admin view)
 */
exports.getAllObjects = async (req, res) => {
    try {
        // In a real scenario, we might filter these based on user permissions too.
        const objects = await ObjectModel.find({});
        res.status(200).json(objects);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching objects', error });
    }
};

/**
 * @description @summary Create a new object
 */
exports.createObject = async (req, res) => {
    try {
        // Assuming request body contains name and owner user ID/Group ID
        const { name, description, resourceType } = req.body;
        if (!name || !resourceType) {
            return res.status(400).json({ message: 'Object name and type are required.' });
        }

        // The actual creation logic should enforce ownership/creator rights checks
        const newObject = await ObjectModel.create({ name, description, resourceType });
        res.status(201).json(newObject);

    } catch (error) {
        res.status(500).json({ message: 'Error creating object', error });
    }
};

/**
 * @description @summary Get a single object by ID
 */
exports.getObjectById = async (req, res) => {
    try {
        const object = await ObjectModel.findById(req.params.id);
        if (!object) {
            return res.status(404).json({ message: 'Object not found.' });
        }
        res.status(200).json(object);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching object', error });
    }
};

/**
 * @description @summary Update an existing object
 */
exports.updateObject = async (req, res) => {
    try {
        const updatedObject = await ObjectModel.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true }
        );

        if (!updatedObject) {
             return res.status(404).json({ message: 'Object not found.' });
        }
        res.status(200).json(updatedObject);

    } catch (error) {
        res.status(500).json({ message: 'Error updating object', error });
    }
};

/**
 * @description @summary Delete an object by ID
 */
exports.deleteObject = async (req, res) => {
    try {
        const object = await ObjectModel.findByIdAndDelete(req.params.id);

        if (!object) {
            return res.status(404).json({ message: 'Object not found.' });
        }
        res.status(200).json({ message: 'Object deleted successfully.' });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting object', error });
    }
};