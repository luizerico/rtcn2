const mongoose = require('mongoose');
const { listAllPermissions, listPermissionCatalog } = require('../services/rbacCatalog');
const { listAssetAcl, replaceAssetAcl, deleteAssetAcl: removeAssetAcl } = require('../services/rbacService');
const { PERMISSION_RESOURCE_TYPES } = require('../constants/rbac');
const { sendServerError, sendError, ERROR_CODES } = require('../utils/httpErrors');

exports.listPermissions = async (req, res) => {
  try {
    const principalType = String(req.query.principalType || '').trim().toUpperCase();
    const principalId = String(req.query.principalId || '').trim();
    if (principalType && !['USER', 'GROUP'].includes(principalType)) {
      return sendError(res, 400, 'principalType must be USER or GROUP.', ERROR_CODES.VALIDATION);
    }
    if (principalId && !mongoose.isValidObjectId(principalId)) {
      return sendError(res, 400, 'Invalid principalId.', ERROR_CODES.VALIDATION);
    }
    res.status(200).json(
      await listAllPermissions({
        principalType: principalType || undefined,
        principalId: principalId || undefined,
      })
    );
  } catch (error) {
    return sendServerError(res, error, 'Error fetching permissions');
  }
};

exports.getPermissionCatalog = async (_req, res) => {
  try {
    res.status(200).json(await listPermissionCatalog());
  } catch (error) {
    return sendServerError(res, error, 'Error fetching permission catalog');
  }
};

function parseAclSelection(source = {}) {
  const resourceType = String(source.resourceType || '').toUpperCase();
  const allObjects = source.allObjects === true || String(source.allObjects || '') === 'true';
  const rawIds = source.resourceIds;
  const objectIds = Array.isArray(rawIds)
    ? rawIds.map((id) => String(id || '').trim()).filter(Boolean)
    : String(rawIds || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
  return { resourceType, allObjects, objectIds };
}

async function sendAssetAcl(res, source) {
  const { resourceType, allObjects, objectIds } = parseAclSelection(source);
  if (!PERMISSION_RESOURCE_TYPES.includes(resourceType)) {
    return sendError(
      res,
      400,
      `resourceType must be an asset subclass: ${PERMISSION_RESOURCE_TYPES.join(', ')}`,
      ERROR_CODES.VALIDATION
    );
  }
  const acl = await listAssetAcl({ resourceType, allObjects, objectIds });
  return res.status(200).json(acl);
}

exports.getAssetAcl = async (req, res) => {
  try {
    return await sendAssetAcl(res, req.query);
  } catch (error) {
    return sendServerError(res, error, 'Error loading asset ACL');
  }
};

exports.queryAssetAcl = async (req, res) => {
  try {
    return await sendAssetAcl(res, req.body || {});
  } catch (error) {
    return sendServerError(res, error, 'Error loading asset ACL');
  }
};

exports.applyAssetAcl = async (req, res) => {
  try {
    const resourceType = String(req.body.resourceType || '').toUpperCase();
    const allObjects = Boolean(req.body.allObjects);
    const objects = Array.isArray(req.body.objects) ? req.body.objects : [];
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];

    if (!PERMISSION_RESOURCE_TYPES.includes(resourceType)) {
      return sendError(res, 400, `Permissions only apply to asset subclasses: ${PERMISSION_RESOURCE_TYPES.join(', ')}`, ERROR_CODES.VALIDATION);
    }

    if (!allObjects && objects.length === 0) {
      return sendError(res, 400, 'Select at least one asset, or choose all objects of this type.', ERROR_CODES.VALIDATION);
    }

    const acl = await replaceAssetAcl({
      resourceType,
      allObjects,
      objects,
      entries,
    });

    res.status(200).json({
      message: 'Permissions updated successfully.',
      acl,
    });
  } catch (error) {
    return sendServerError(res, error, 'Error applying asset ACL');
  }
};

exports.deleteAssetAcl = async (req, res) => {
  try {
    const resourceType = String(req.body.resourceType || '').toUpperCase();
    const allObjects = Boolean(req.body.allObjects);
    const resourceIds = Array.isArray(req.body.resourceIds) ? req.body.resourceIds : [];

    if (!PERMISSION_RESOURCE_TYPES.includes(resourceType)) {
      return sendError(
        res,
        400,
        `Permissions only apply to asset subclasses: ${PERMISSION_RESOURCE_TYPES.join(', ')}`,
        ERROR_CODES.VALIDATION
      );
    }

    if (!allObjects && resourceIds.length === 0) {
      return sendError(
        res,
        400,
        'Select at least one asset, or choose all objects of this type.',
        ERROR_CODES.VALIDATION
      );
    }

    const result = await removeAssetAcl({
      resourceType,
      allObjects,
      objectIds: resourceIds,
    });

    res.status(200).json({
      message: 'Permissions deleted.',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return sendServerError(res, error, 'Error deleting asset ACL');
  }
};
