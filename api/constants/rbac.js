const { ASSET_KINDS } = require('./assetTypes');

const IDENTITY_RESOURCE_TYPES = ['USER', 'GROUP'];

/** Concrete DB classes only — no abstract ASSET umbrella. */
const RESOURCE_TYPES = [...IDENTITY_RESOURCE_TYPES, ...ASSET_KINDS];
const ACTIONS = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN'];

const RESOURCE_TYPE_LABELS = {
  USER: 'Users',
  GROUP: 'Groups',
  DOCUMENT: 'Documents',
  DASHBOARD: 'Dashboards',
  DATASET: 'Datasets',
  SURVEY: 'Surveys',
  SURVEY_RESPONSE: 'Survey responses',
};

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
  if (grantedActions.has('ADMIN') || grantedActions.has(requiredAction)) {
    return true;
  }
  return requiredAction === 'CREATE' && grantedActions.has('WRITE');
}

module.exports = {
  IDENTITY_RESOURCE_TYPES,
  RESOURCE_TYPES,
  ACTIONS,
  RESOURCE_TYPE_LABELS,
  ASSET_KINDS,
  buildFullAdminPermissions,
  parsePermissionString,
  actionIsAllowed,
};
