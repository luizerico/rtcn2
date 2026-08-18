const { ASSET_KINDS } = require('./assetTypes');

/** Not permission targets — used only for admin route guards via admin-group membership. */
const IDENTITY_RESOURCE_TYPES = ['USER', 'GROUP', 'ORGANIZATION', 'LOG'];
const PRINCIPAL_TYPES = ['USER', 'GROUP'];

/**
 * COUNTY is a geo subject (seeded catalog), not an Asset kind.
 * USER, GROUP, and ORGANIZATION are identity (not permission resourceType values).
 * USER and GROUP are principals; ORGANIZATION is an affiliation catalog.
 */
const SUBJECT_RESOURCE_TYPES = ['COUNTY'];
const RESOURCE_TYPES = [...ASSET_KINDS, ...SUBJECT_RESOURCE_TYPES];
const PERMISSION_RESOURCE_TYPES = [...RESOURCE_TYPES];

const ACTIONS = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN'];

const RESOURCE_TYPE_LABELS = {
  SURVEY: 'Surveys',
  SPONSOR: 'Sponsors',
  OPPORTUNITY: 'Opportunities',
  PROJECT: 'Projects',
  COUNTY: 'Counties',
};

const ACTION_LABELS = {
  ADMIN: 'Full control',
  WRITE: 'Modify',
  READ: 'Read',
  CREATE: 'Create',
  DELETE: 'Delete',
};

function buildFullAdminPermissions(groupId) {
  if (!groupId) {
    throw new Error('groupId is required to build admin permissions.');
  }

  const permissions = [];
  for (const resourceType of RESOURCE_TYPES) {
    for (const permission of ACTIONS) {
      permissions.push({
        principalType: 'GROUP',
        principalId: groupId,
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

  if (!ACTIONS.includes(action)) {
    return null;
  }

  // Identity route guards (USER:*, GROUP:*, ORGANIZATION:*) — not asset permission rows.
  if (IDENTITY_RESOURCE_TYPES.includes(resourceType)) {
    return { resourceType, action, identity: true };
  }

  if (!RESOURCE_TYPES.includes(resourceType)) {
    return null;
  }

  return { resourceType, action, identity: false };
}

function actionIsAllowed(requiredAction, grantedActions) {
  if (grantedActions.has('ADMIN') || grantedActions.has(requiredAction)) {
    return true;
  }
  return requiredAction === 'CREATE' && grantedActions.has('WRITE');
}

module.exports = {
  IDENTITY_RESOURCE_TYPES,
  PRINCIPAL_TYPES,
  RESOURCE_TYPES,
  PERMISSION_RESOURCE_TYPES,
  ACTIONS,
  RESOURCE_TYPE_LABELS,
  ACTION_LABELS,
  ASSET_KINDS,
  SUBJECT_RESOURCE_TYPES,
  buildFullAdminPermissions,
  parsePermissionString,
  actionIsAllowed,
};
