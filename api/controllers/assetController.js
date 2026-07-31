const { Asset } = require('../models/Asset');

function auditFields(userId, existing) {
  if (existing) {
    return { updatedBy: userId };
  }
  return {
    ownerId: userId,
    createdBy: userId,
    updatedBy: userId,
  };
}

/**
 * List assets (excludes survey responses by default unless kind filter asks for them).
 */
exports.getAllAssets = async (req, res) => {
  try {
    const filter = {};
    if (req.query.kind) {
      filter.kind = String(req.query.kind).toUpperCase();
    } else if (req.query.assetType) {
      filter.assetType = req.query.assetType;
    } else {
      filter.kind = { $nin: ['SURVEY_RESPONSE'] };
    }

    const assets = await Asset.find(filter)
      .sort({ updatedAt: -1 })
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .populate('ownerId', 'username email');

    res.status(200).json(assets);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching assets', error: error.message });
  }
};

exports.createAsset = async (req, res) => {
  try {
    const { name, description, kind } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Asset name is required.' });
    }

    const normalizedKind = String(kind || 'DOCUMENT').toUpperCase();
    if (['SURVEY', 'SURVEY_RESPONSE'].includes(normalizedKind)) {
      return res.status(400).json({
        message: 'Use the surveys API to create Survey or SurveyResponse assets.',
      });
    }

    const asset = await Asset.create({
      name,
      description: description || '',
      kind: normalizedKind,
      ...auditFields(req.user._id),
    });

    res.status(201).json(asset);
  } catch (error) {
    res.status(500).json({ message: 'Error creating asset', error: error.message });
  }
};

exports.getAssetById = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id)
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .populate('ownerId', 'username email');

    if (!asset) {
      return res.status(404).json({ message: 'Asset not found.' });
    }
    res.status(200).json(asset);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching asset', error: error.message });
  }
};

exports.updateAsset = async (req, res) => {
  try {
    const { name, description, kind } = req.body;
    const updates = {
      ...auditFields(req.user._id, true),
    };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (kind !== undefined) {
      const normalizedKind = String(kind).toUpperCase();
      if (['SURVEY', 'SURVEY_RESPONSE'].includes(normalizedKind)) {
        return res.status(400).json({ message: 'Cannot change asset kind to a survey type here.' });
      }
      updates.kind = normalizedKind;
    }

    const updated = await Asset.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: 'Asset not found.' });
    }
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Error updating asset', error: error.message });
  }
};

exports.deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findByIdAndDelete(req.params.id);
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found.' });
    }
    res.status(200).json({ message: 'Asset deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting asset', error: error.message });
  }
};
