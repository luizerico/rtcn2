const { listAllPermissions, listPermissionCatalog } = require('../services/rbacService');

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
