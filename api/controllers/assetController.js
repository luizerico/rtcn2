const {
  Asset,
  DocumentAsset,
  DashboardAsset,
  DatasetAsset,
} = require('../models/assets');
const { kindToDiscriminator } = require('../constants/assetTypes');
const { sendServerError, sendError, ERROR_CODES } = require('../utils/httpErrors');

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

function modelForKind(kind) {
  switch (String(kind || '').toUpperCase()) {
    case 'DASHBOARD':
      return DashboardAsset;
    case 'DATASET':
      return DatasetAsset;
    case 'DOCUMENT':
    default:
      return DocumentAsset;
  }
}

/**
 * List assets (excludes survey responses by default unless kind filter asks for them).
 * Results are limited to objects the caller can READ.
 */
exports.getAllAssets = async (req, res) => {
  try {
    const { listAccessibleResources } = require('../services/rbacService');
    const { ASSET_KINDS } = require('../constants/rbac');

    const kindFilter = req.query.kind
      ? [String(req.query.kind).toUpperCase()]
      : req.query.assetType
        ? null
        : ASSET_KINDS.filter((k) => k !== 'SURVEY_RESPONSE');

    const orClauses = [];

    const kindsToCheck = kindFilter || ASSET_KINDS;
    for (const kind of kindsToCheck) {
      const access = await listAccessibleResources(req.user, `${kind}:READ`);
      if (access.all) {
        const clause = { kind };
        if (req.query.assetType) clause.assetType = req.query.assetType;
        orClauses.push(clause);
      } else if (access.ids.length) {
        orClauses.push({ kind, _id: { $in: access.ids } });
      }
    }

    if (!orClauses.length) {
      return res.status(200).json([]);
    }

    const assets = await Asset.find({ $or: orClauses })
      .sort({ updatedAt: -1 })
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .populate('ownerId', 'username email');

    res.status(200).json(assets);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching assets');
  }
};

exports.createAsset = async (req, res) => {
  try {
    const { name, description, kind } = req.body;
    if (!name) {
      return sendError(res, 400, 'Asset name is required.', ERROR_CODES.VALIDATION);
    }

    const normalizedKind = String(kind || 'DOCUMENT').toUpperCase();
    if (['SURVEY', 'SURVEY_RESPONSE'].includes(normalizedKind)) {
      return sendError(res, 400, 'Use the surveys API to create Survey or SurveyResponse assets.', ERROR_CODES.VALIDATION);
    }

    if (!kindToDiscriminator(normalizedKind)) {
      return sendError(res, 400, 'Invalid asset kind.', ERROR_CODES.VALIDATION);
    }

    const Model = modelForKind(normalizedKind);
    const asset = await Model.create({
      name,
      description: description || '',
      kind: normalizedKind,
      ...auditFields(req.user._id),
    });

    res.status(201).json(asset);
  } catch (error) {
    return sendServerError(res, error, 'Error creating asset');
  }
};

exports.getAssetById = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id)
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .populate('ownerId', 'username email');

    if (!asset) {
      return sendError(res, 404, 'Asset not found.', ERROR_CODES.NOT_FOUND);
    }
    res.status(200).json(asset);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching asset');
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
        return sendError(res, 400, 'Cannot change asset kind to a survey type here.', ERROR_CODES.VALIDATION);
      }
      if (!kindToDiscriminator(normalizedKind)) {
        return sendError(res, 400, 'Invalid asset kind.', ERROR_CODES.VALIDATION);
      }
      updates.kind = normalizedKind;
      updates.assetType = kindToDiscriminator(normalizedKind);
    }

    const updated = await Asset.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!updated) {
      return sendError(res, 404, 'Asset not found.', ERROR_CODES.NOT_FOUND);
    }
    res.status(200).json(updated);
  } catch (error) {
    return sendServerError(res, error, 'Error updating asset');
  }
};

exports.deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findByIdAndDelete(req.params.id);
    if (!asset) {
      return sendError(res, 404, 'Asset not found.', ERROR_CODES.NOT_FOUND);
    }
    res.status(200).json({ message: 'Asset deleted successfully.' });
  } catch (error) {
    return sendServerError(res, error, 'Error deleting asset');
  }
};
