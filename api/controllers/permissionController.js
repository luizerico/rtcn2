const {
  listAllPermissions,
  listPermissionCatalog,
  listAssetAcl,
  replaceAssetAcl,
} = require('../services/rbacService');
const { PERMISSION_RESOURCE_TYPES } = require('../constants/rbac');

exports.listPermissions = async (_req, res) => {
  try {
    res.status(200).json(await listAllPermissions());
  } catch (error) {
    res.status(500).json({ message: 'Error fetching permissions', error: error.message });
  }
};

exports.getPermissionCatalog = async (_req, res) => {
  try {
    res.status(200).json(await listPermissionCatalog());
  } catch (error) {
    res.status(500).json({ message: 'Error fetching permission catalog', error: error.message });
  }
};

exports.getAssetAcl = async (req, res) => {
  try {
    const resourceType = String(req.query.resourceType || '').toUpperCase();
    if (!PERMISSION_RESOURCE_TYPES.includes(resourceType)) {
      return res.status(400).json({
        message: `resourceType must be an asset subclass: ${PERMISSION_RESOURCE_TYPES.join(', ')}`,
      });
    }

    const allObjects = String(req.query.allObjects || '') === 'true';
    const objectIds = String(req.query.resourceIds || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const acl = await listAssetAcl({ resourceType, allObjects, objectIds });
    res.status(200).json(acl);
  } catch (error) {
    res.status(500).json({ message: 'Error loading asset ACL', error: error.message });
  }
};

exports.applyAssetAcl = async (req, res) => {
  try {
    const resourceType = String(req.body.resourceType || '').toUpperCase();
    const allObjects = Boolean(req.body.allObjects);
    const objects = Array.isArray(req.body.objects) ? req.body.objects : [];
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];

    if (!PERMISSION_RESOURCE_TYPES.includes(resourceType)) {
      return res.status(400).json({
        message: `Permissions only apply to asset subclasses: ${PERMISSION_RESOURCE_TYPES.join(', ')}`,
      });
    }

    if (!allObjects && objects.length === 0) {
      return res.status(400).json({
        message: 'Select at least one asset, or choose all objects of this type.',
      });
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
    res.status(400).json({ message: error.message || 'Error applying asset ACL' });
  }
};
