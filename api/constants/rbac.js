const RESOURCE_TYPES = ['USER', 'GROUP', 'ASSET'];
const ACTIONS = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN'];

/**
 * Full admin policy matrix for a group (standalone Permission documents).
 */
function buildFullAdminPermissions(groupId) {
  if (!groupId) {
    throw new Error('groupId is required to build admin permissions.');
  }

  const permissions = [];

  for (const resourceType of RESOURCE_TYPES) {
    for (const permission of ACTIONS) {
      permissions.push({
        groupId,
        resourceType,
        target: '*',
        resourceId: null,
        permission,
      });
    }
  }

  return permissions;
}

function parsePermissionString(permission) {
  if (typeof permission !== 'string' || !permission.includes(':')) {
    return null;
  }

  const [resourceTypeRaw, actionRaw] = permission.split(':');
  const resourceType = String(resourceTypeRaw || '').toUpperCase();
  const action = String(actionRaw || '').toUpperCase();

  if (!RESOURCE_TYPES.includes(resourceType) || !ACTIONS.includes(action)) {
    return null;
  }

  return { resourceType, action };
}

function actionIsAllowed(requiredAction, grantedActions) {
  if (grantedActions.has('ADMIN')) {
    return true;
  }

  if (grantedActions.has(requiredAction)) {
    return true;
  }

  if (requiredAction === 'CREATE' && grantedActions.has('WRITE')) {
    return true;
  }

  return false;
}

module.exports = {
  RESOURCE_TYPES,
  ACTIONS,
  buildFullAdminPermissions,
  parsePermissionString,
  actionIsAllowed,
};
