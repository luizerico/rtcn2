const {
  modelForKind,
  findAssetById,
  ASSET_KINDS,
} = require('../models/assets');
const { kindToDiscriminator } = require('../constants/assetTypes');
const { sendServerError, sendError, ERROR_CODES } = require('../utils/httpErrors');
const { activeFilter, applyTrash } = require('../services/trash');

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

/** Generic POST /api/assets create is retired; use dedicated survey/sponsor/opportunity/project APIs. */
const CREATE_KINDS = new Set();

/**
 * List assets the caller can READ across concrete collections.
 */
exports.getAllAssets = async (req, res) => {
  try {
    const { listAccessibleResources } = require('../services/rbacService');

    const kindFilter = req.query.kind
      ? [String(req.query.kind).toUpperCase()]
      : null;

    const kindsToCheck = kindFilter || ASSET_KINDS.filter((k) => CREATE_KINDS.has(k) || k === 'SURVEY');
    const batches = [];

    for (const kind of kindsToCheck) {
      if (!ASSET_KINDS.includes(kind)) continue;
      const Model = modelForKind(kind);
      if (!Model) continue;

      const access = await listAccessibleResources(req.user, `${kind}:READ`);
      const filter = activeFilter();
      if (req.query.assetType) filter.assetType = req.query.assetType;

      if (access.all) {
        // no id restriction
      } else if (access.ids.length) {
        filter._id = { $in: access.ids };
      } else {
        continue;
      }

      const rows = await Model.find(filter)
        .populate('createdBy', 'username email')
        .populate('updatedBy', 'username email')
        .populate('ownerId', 'username email')
        .lean();
      batches.push(...rows);
    }

    batches.sort((a, b) => {
      const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bt - at;
    });

    res.status(200).json(batches);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching assets');
  }
};

exports.createAsset = async (req, res) => {
  try {
    const { name, description, kind } = req.validated || req.body;
    const normalizedKind = String(kind || '').toUpperCase();

    if (!CREATE_KINDS.has(normalizedKind) || !kindToDiscriminator(normalizedKind)) {
      return sendError(res, 400, 'Invalid asset kind.', ERROR_CODES.VALIDATION);
    }

    const Model = modelForKind(normalizedKind);
    const asset = await Model.create({
      name,
      description: description || '',
      kind: normalizedKind,
      assetType: kindToDiscriminator(normalizedKind),
      ...auditFields(req.user._id),
    });

    res.status(201).json(asset);
  } catch (error) {
    return sendServerError(res, error, 'Error creating asset');
  }
};

exports.getAssetById = async (req, res) => {
  try {
    const asset = req.asset || (await findAssetById(req.params.id));
    if (!asset) {
      return sendError(res, 404, 'Asset not found.', ERROR_CODES.NOT_FOUND);
    }

    await asset.populate([
      { path: 'createdBy', select: 'username email' },
      { path: 'updatedBy', select: 'username email' },
      { path: 'ownerId', select: 'username email' },
    ]);

    res.status(200).json(asset);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching asset');
  }
};

exports.updateAsset = async (req, res) => {
  try {
    const asset = req.asset || (await findAssetById(req.params.id));
    if (!asset) {
      return sendError(res, 404, 'Asset not found.', ERROR_CODES.NOT_FOUND);
    }

    const { name, description, kind } = req.body;
    if (name !== undefined) asset.name = name;
    if (description !== undefined) asset.description = description;
    if (kind !== undefined) {
      const normalizedKind = String(kind).toUpperCase();
      if (normalizedKind !== String(asset.kind).toUpperCase()) {
        return sendError(
          res,
          400,
          'Cannot change asset kind across collections. Create a new asset instead.',
          ERROR_CODES.VALIDATION
        );
      }
    }

    asset.updatedBy = req.user._id;
    await asset.save();
    res.status(200).json(asset);
  } catch (error) {
    return sendServerError(res, error, 'Error updating asset');
  }
};

exports.deleteAsset = async (req, res) => {
  try {
    const asset = req.asset || (await findAssetById(req.params.id));
    if (!asset) {
      return sendError(res, 404, 'Asset not found.', ERROR_CODES.NOT_FOUND);
    }
    applyTrash(asset, req.user._id);
    await asset.save();
    res.status(200).json({ message: 'Asset moved to recycle bin.' });
  } catch (error) {
    return sendServerError(res, error, 'Error deleting asset');
  }
};
