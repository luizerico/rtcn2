const mongoose = require('mongoose');
const { listAllPermissions, listPermissionCatalog } = require('../services/rbacCatalog');
const { listAssetAcl, replaceAssetAcl } = require('../services/rbacService');
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

exports.getAssetAcl = async (req, res) => {
  try {
    const resourceType = String(req.query.resourceType || '').toUpperCase();
    if (!PERMISSION_RESOURCE_TYPES.includes(resourceType)) {
      return sendError(res, 400, `resourceType must be an asset subclass: ${PERMISSION_RESOURCE_TYPES.join(', ')}`, ERROR_CODES.VALIDATION);
    }

    const allObjects = String(req.query.allObjects || '') === 'true';
    const objectIds = String(req.query.resourceIds || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const acl = await listAssetAcl({ resourceType, allObjects, objectIds });
    res.status(200).json(acl);
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
