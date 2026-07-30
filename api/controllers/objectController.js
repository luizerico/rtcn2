const ObjectModel = require('../models/ObjectModel');

/**
 * @description Get all objects
 */
exports.getAllObjects = async (req, res) => {
  try {
    const objects = await ObjectModel.find({});
    res.status(200).json(objects);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching objects', error: error.message });
  }
};

/**
 * @description Create a new object
 */
exports.createObject = async (req, res) => {
  try {
    const { name, description, resourceType } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Object name is required.' });
    }

    const newObject = await ObjectModel.create({
      name,
      description,
      resourceType: resourceType || 'DOCUMENT',
      ownerId: req.user._id,
    });

    res.status(201).json(newObject);
  } catch (error) {
    res.status(500).json({ message: 'Error creating object', error: error.message });
  }
};

/**
 * @description Get a single object by ID
 */
exports.getObjectById = async (req, res) => {
  try {
    const object = await ObjectModel.findById(req.params.id);
    if (!object) {
      return res.status(404).json({ message: 'Object not found.' });
    }
    res.status(200).json(object);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching object', error: error.message });
  }
};

/**
 * @description Update an existing object
 */
exports.updateObject = async (req, res) => {
  try {
    const updatedObject = await ObjectModel.findByIdAndUpdate(req.params.id, req.body, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!updatedObject) {
      return res.status(404).json({ message: 'Object not found.' });
    }
    res.status(200).json(updatedObject);
  } catch (error) {
    res.status(500).json({ message: 'Error updating object', error: error.message });
  }
};

/**
 * @description Delete an object by ID
 */
exports.deleteObject = async (req, res) => {
  try {
    const object = await ObjectModel.findByIdAndDelete(req.params.id);

    if (!object) {
      return res.status(404).json({ message: 'Object not found.' });
    }
    res.status(200).json({ message: 'Object deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting object', error: error.message });
  }
};
