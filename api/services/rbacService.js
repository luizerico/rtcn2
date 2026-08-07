const Group = require('../models/Group');
const Permission = require('../models/Permission');
const {
  parsePermissionString,
  actionIsAllowed,
  IDENTITY_RESOURCE_TYPES,
  PERMISSION_RESOURCE_TYPES,
  ACTIONS,
} = require('../constants/rbac');
const {
  listAllPermissions,
  listPermissionCatalog,
  normalizePrincipal,
  resolvePrincipalNames,
} = require('./rbacCatalog');

async function getUserGroupIds(user) {
  if (!user?._id) return [];

  const groupIds = new Set();
  if (user.roleId) groupIds.add(String(user.roleId));

  const memberGroups = await Group.find({ members: user._id }).select('_id');
  for (const group of memberGroups) {
    groupIds.add(String(group._id));
  }

  return [...groupIds];
}

function isClassWide(policy) {
  return !policy.resourceId && (policy.target === '*' || policy.target === '');
}

/**
 * Authorization hot-path filter. Requires principals already normalized
 * (principalType + principalId) — see migratePermissionPrincipals on connect.
 */
function principalQueryForUser(userId, groupIds) {
  const clauses = [{ principalType: 'USER', principalId: userId }];
  if (groupIds.length) {
    clauses.push({ principalType: 'GROUP', principalId: { $in: groupIds } });
  }
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

function collectGrantedActions(permissions, resourceType, { resourceId, allowAnyInstance = false } = {}) {
  const granted = new Set();

  for (const policy of permissions) {
    if (policy.resourceType !== resourceType) continue;

    if (isClassWide(policy)) {
      granted.add(policy.permission);
      continue;
    }

    if (resourceId && policy.resourceId && String(policy.resourceId) === String(resourceId)) {
      granted.add(policy.permission);
      continue;
    }

    if (!resourceId && allowAnyInstance && policy.resourceId) {
      granted.add(policy.permission);
    }
  }

  return granted;
}

async function loadPermissionsForUser(user) {
  const groupIds = await getUserGroupIds(user);
  return Permission.find(principalQueryForUser(user._id, groupIds));
}

async function userIsAdminGroupMember(user) {
  const groupIds = await getUserGroupIds(user);
  if (!groupIds.length) return false;
  const adminGroup = await Group.findOne({
    name: 'admin',
    _id: { $in: groupIds },
  }).select('_id');
  return Boolean(adminGroup);
}

async function userHasPermission(user, permissionString, options = {}) {
  const parsed = parsePermissionString(permissionString);
  if (!parsed) return false;

  // USER/GROUP are not asset subclasses — identity admin routes use admin-group membership.
  if (parsed.identity) {
    return userIsAdminGroupMember(user);
  }

  const permissions = await loadPermissionsForUser(user);
  return actionIsAllowed(
    parsed.action,
    collectGrantedActions(permissions, parsed.resourceType, options)
  );
}

async function listAccessibleResources(user, permissionString) {
  const parsed = parsePermissionString(permissionString);
  if (!parsed) return { all: false, ids: [] };

  const permissions = await loadPermissionsForUser(user);
  const ids = new Set();

  for (const policy of permissions) {
    if (policy.resourceType !== parsed.resourceType) continue;
    if (!actionIsAllowed(parsed.action, new Set([policy.permission]))) continue;

    if (isClassWide(policy)) return { all: true, ids: [] };
    if (policy.resourceId) ids.add(String(policy.resourceId));
  }

  return { all: false, ids: [...ids] };
}

async function listUserPermissions(user) {
  const permissions = await loadPermissionsForUser(user);
  if (!permissions.length) return [];

  const { userNameById, groupNameById } = await resolvePrincipalNames(permissions);

  return permissions
    .filter((policy) => PERMISSION_RESOURCE_TYPES.includes(policy.resourceType))
    .map((policy) => {
    const principal = normalizePrincipal(policy);
    const principalName =
      principal.principalType === 'USER'
        ? userNameById.get(principal.principalId) || 'Unknown user'
        : groupNameById.get(principal.principalId) || 'Unknown group';

    return {
      id: policy._id,
      principalType: principal.principalType,
      principalId: principal.principalId,
      principalName,
      groupId: principal.principalType === 'GROUP' ? principal.principalId : null,
      groupName: principal.principalType === 'GROUP' ? principalName : null,
      resourceType: policy.resourceType,
      target: policy.target,
      resourceId: policy.resourceId,
      permission: policy.permission,
    };
  });
}

async function listGroupPermissions(groupId) {
  return Permission.find({
    principalType: 'GROUP',
    principalId: groupId,
  }).sort({ resourceType: 1, target: 1, permission: 1 });
}

function buildPermissionDocs({ principalType, principalId, resourceType, scopes, allObjects, objects }) {
  const docs = [];

  const basePrincipal =
    principalType === 'GROUP'
      ? { principalType, principalId, groupId: principalId }
      : { principalType, principalId };

  if (allObjects) {
    for (const permission of scopes) {
      docs.push({
        ...basePrincipal,
        resourceType,
        target: '*',
        resourceId: null,
        permission,
      });
    }
    return docs;
  }

  for (const object of objects) {
    const resourceId = object.id || object.resourceId;
    if (!resourceId) continue;
    const target = object.label || object.name || String(resourceId);
    for (const permission of scopes) {
      docs.push({
        ...basePrincipal,
        resourceType,
        target,
        resourceId,
        permission,
      });
    }
  }

  return docs;
}

/**
 * @deprecated Prefer replaceAssetAcl (POST /api/permissions/acl). This helper only
 * mutates one GROUP principal for the selected assets; it no longer wipes that
 * group's unrelated instance/class grants for the same resource type.
 */
async function replaceGroupClassPermissions({
  groupId,
  resourceType,
  scopes,
  allObjects = false,
  objects = [],
}) {
  const objectIds = (objects || [])
    .map((object) => object.id || object.resourceId)
    .filter(Boolean)
    .map(String);

  if (!allObjects && !objectIds.length) {
    throw new Error('Select at least one asset, or choose all objects of this type.');
  }

  // Selection-scoped delete for this group only — never wipe sibling grants.
  const deleteFilter = {
    resourceType,
    $or: [{ principalType: 'GROUP', principalId: groupId }, { groupId }],
  };
  if (allObjects) {
    deleteFilter.resourceId = null;
    deleteFilter.target = '*';
  } else {
    deleteFilter.resourceId = { $in: objectIds };
  }

  await Permission.deleteMany(deleteFilter);
  if (!scopes.length) return listGroupPermissions(groupId);

  const docs = buildPermissionDocs({
    principalType: 'GROUP',
    principalId: groupId,
    resourceType,
    scopes,
    allObjects,
    objects,
  });

  if (docs.length) {
    await Permission.insertMany(docs, { ordered: false });
  }
  return listGroupPermissions(groupId);
}

async function replaceGroupPermissions(groupId, permissionDocs) {
  await Permission.deleteMany({
    $or: [
      { principalType: 'GROUP', principalId: groupId },
      { groupId },
    ],
  });
  if (!permissionDocs.length) return [];

  const normalized = permissionDocs.map((doc) => ({
    principalType: doc.principalType || 'GROUP',
    principalId: doc.principalId || doc.groupId || groupId,
    groupId: doc.groupId || (doc.principalType === 'USER' ? null : groupId),
    resourceType: doc.resourceType,
    target: doc.target,
    resourceId: doc.resourceId ?? null,
    permission: doc.permission,
  }));

  await Permission.insertMany(normalized, { ordered: false });
  return listGroupPermissions(groupId);
}

/**
 * Replace the ACL for one asset class selection (class-wide or specific objects)
 * with the provided principal entries (Windows-style Apply).
 */
async function replaceAssetAcl({ resourceType, allObjects = false, objects = [], entries = [] }) {
  if (!PERMISSION_RESOURCE_TYPES.includes(resourceType)) {
    throw new Error(`Permissions only apply to asset subclasses: ${PERMISSION_RESOURCE_TYPES.join(', ')}`);
  }

  const objectIds = (objects || [])
    .map((object) => object.id || object.resourceId)
    .filter(Boolean)
    .map(String);

  if (!allObjects && !objectIds.length) {
    throw new Error('Select at least one asset, or choose all objects of this type.');
  }

  const deleteFilter = { resourceType };
  if (allObjects) {
    deleteFilter.resourceId = null;
    deleteFilter.target = '*';
  } else {
    deleteFilter.resourceId = { $in: objectIds };
  }

  await Permission.deleteMany(deleteFilter);

  const docs = [];
  for (const entry of entries) {
    const principalType = String(entry.principalType || '').toUpperCase();
    const principalId = entry.principalId;
    const scopes = Array.isArray(entry.scopes)
      ? entry.scopes.map((scope) => String(scope).toUpperCase()).filter((scope) => ACTIONS.includes(scope))
      : [];

    if (!['USER', 'GROUP'].includes(principalType) || !principalId || !scopes.length) {
      continue;
    }

    docs.push(
      ...buildPermissionDocs({
        principalType,
        principalId,
        resourceType,
        scopes,
        allObjects,
        objects,
      })
    );
  }

  if (docs.length) {
    await Permission.insertMany(docs, { ordered: false });
  }

  return listAssetAcl({ resourceType, allObjects, objectIds });
}

async function listAssetAcl({ resourceType, allObjects = false, objectIds = [] }) {
  const filter = { resourceType };
  if (allObjects) {
    filter.resourceId = null;
    filter.$or = [{ target: '*' }, { target: '' }];
  } else if (objectIds.length) {
    filter.resourceId = { $in: objectIds };
  } else {
    return { resourceType, allObjects, objects: objectIds, entries: [] };
  }

  const rows = await Permission.find(filter).lean();
  const { userNameById, groupNameById } = await resolvePrincipalNames(rows);

  const byPrincipal = new Map();
  for (const row of rows) {
    const principal = normalizePrincipal(row);
    const key = `${principal.principalType}:${principal.principalId}`;
    if (!byPrincipal.has(key)) {
      byPrincipal.set(key, {
        principalType: principal.principalType,
        principalId: principal.principalId,
        principalName:
          principal.principalType === 'USER'
            ? userNameById.get(principal.principalId) || 'Unknown user'
            : groupNameById.get(principal.principalId) || 'Unknown group',
        scopes: new Set(),
      });
    }
    byPrincipal.get(key).scopes.add(row.permission);
  }

  return {
    resourceType,
    allObjects,
    objects: objectIds,
    entries: [...byPrincipal.values()]
      .map((entry) => ({
        ...entry,
        scopes: [...entry.scopes].sort(),
      }))
      .sort((a, b) => a.principalName.localeCompare(b.principalName)),
  };
}

/** Normalize legacy rows, drop non-asset targets, and remove obsolete unique indexes. */
async function migratePermissionPrincipals() {
  await Permission.deleteMany({ resourceType: { $in: IDENTITY_RESOURCE_TYPES } });

  try {
    const collection = Permission.collection;
    const indexes = await collection.indexes();
    for (const index of indexes) {
      const name = index.name;
      if (!name || name === '_id_') continue;
      // Legacy unique key ignored resourceId and collided on null groupId + same target name.
      if (
        name === 'groupId_1_resourceType_1_target_1_permission_1' ||
        name === 'groupId_1_resourceType_1_resourceId_1_permission_1'
      ) {
        await collection.dropIndex(name);
      }
    }
    await Permission.syncIndexes();
  } catch (error) {
    console.warn('Permission index migration skipped:', error.message);
  }

  const legacyFilter = {
    $or: [{ principalType: { $exists: false } }, { principalType: null }, { principalId: { $exists: false } }],
  };

  const deleted = await Permission.deleteMany({
    $and: [legacyFilter, { $or: [{ groupId: { $exists: false } }, { groupId: null }] }],
  });

  const updated = await Permission.collection.updateMany(
    {
      $and: [legacyFilter, { groupId: { $exists: true, $ne: null } }],
    },
    [
      {
        $set: {
          principalType: 'GROUP',
          principalId: '$groupId',
        },
      },
    ]
  );

  return {
    deleted: deleted.deletedCount || 0,
    updated: updated.modifiedCount || 0,
  };
}

module.exports = {
  userHasPermission,
  userIsAdminGroupMember,
  listAccessibleResources,
  listUserPermissions,
  listGroupPermissions,
  listAllPermissions,
  replaceGroupClassPermissions,
  replaceGroupPermissions,
  replaceAssetAcl,
  listAssetAcl,
  listPermissionCatalog,
  migratePermissionPrincipals,
  principalQueryForUser,
};
