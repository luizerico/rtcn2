const Group = require('../models/Group');
const User = require('../models/User');
const Permission = require('../models/Permission');
const { Asset } = require('../models/Asset');
const {
  parsePermissionString,
  actionIsAllowed,
  RESOURCE_TYPES,
  RESOURCE_TYPE_LABELS,
  IDENTITY_RESOURCE_TYPES,
  ASSET_KINDS,
} = require('../constants/rbac');

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

async function userHasPermission(user, permissionString, options = {}) {
  const parsed = parsePermissionString(permissionString);
  if (!parsed) return false;

  const groupIds = await getUserGroupIds(user);
  const permissions = groupIds.length
    ? await Permission.find({ groupId: { $in: groupIds } })
    : [];
  return actionIsAllowed(
    parsed.action,
    collectGrantedActions(permissions, parsed.resourceType, options)
  );
}

async function listAccessibleResources(user, permissionString) {
  const parsed = parsePermissionString(permissionString);
  if (!parsed) return { all: false, ids: [] };

  const groupIds = await getUserGroupIds(user);
  const permissions = groupIds.length
    ? await Permission.find({ groupId: { $in: groupIds } })
    : [];
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
  const groupIds = await getUserGroupIds(user);
  if (!groupIds.length) return [];

  const groups = await Group.find({ _id: { $in: groupIds } }).select('name');
  const groupNameById = new Map(groups.map((group) => [String(group._id), group.name]));
  const permissions = await Permission.find({ groupId: { $in: groupIds } });

  return permissions.map((policy) => ({
    id: policy._id,
    groupId: policy.groupId,
    groupName: groupNameById.get(String(policy.groupId)) || null,
    resourceType: policy.resourceType,
    target: policy.target,
    resourceId: policy.resourceId,
    permission: policy.permission,
  }));
}

async function listGroupPermissions(groupId) {
  return Permission.find({ groupId }).sort({ resourceType: 1, target: 1, permission: 1 });
}

async function listAllPermissions() {
  const permissions = await Permission.find({})
    .sort({ resourceType: 1, target: 1, groupId: 1, permission: 1 })
    .lean();

  if (!permissions.length) return [];

  const groupIds = [...new Set(permissions.map((row) => String(row.groupId)))];
  const groups = await Group.find({ _id: { $in: groupIds } }).select('name').lean();
  const groupNameById = new Map(groups.map((group) => [String(group._id), group.name]));

  return permissions.map((row) => ({
    _id: row._id,
    groupId: row.groupId,
    groupName: groupNameById.get(String(row.groupId)) || 'Unknown group',
    resourceType: row.resourceType,
    target: row.target,
    resourceId: row.resourceId,
    permission: row.permission,
  }));
}

async function replaceGroupClassPermissions({
  groupId,
  resourceType,
  scopes,
  allObjects = false,
  objects = [],
}) {
  await Permission.deleteMany({ groupId, resourceType });
  if (!scopes.length) return [];

  const docs = [];

  if (allObjects) {
    for (const permission of scopes) {
      docs.push({
        groupId,
        resourceType,
        target: '*',
        resourceId: null,
        permission,
      });
    }
  } else {
    for (const object of objects) {
      const resourceId = object.id || object.resourceId;
      if (!resourceId) continue;
      const target = object.label || object.name || String(resourceId);
      for (const permission of scopes) {
        docs.push({
          groupId,
          resourceType,
          target,
          resourceId,
          permission,
        });
      }
    }
  }

  if (docs.length) {
    await Permission.insertMany(docs, { ordered: false });
  }
  return listGroupPermissions(groupId);
}

async function replaceGroupPermissions(groupId, permissionDocs) {
  await Permission.deleteMany({ groupId });
  if (!permissionDocs.length) return [];
  await Permission.insertMany(permissionDocs, { ordered: false });
  return listGroupPermissions(groupId);
}

async function listPermissionCatalog() {
  const [users, groups, assets] = await Promise.all([
    User.find({}).select('username email').sort({ username: 1 }).lean(),
    Group.find({}).select('name').sort({ name: 1 }).lean(),
    Asset.find({}).select('name kind').sort({ name: 1 }).lean(),
  ]);

  const classes = [
    {
      resourceType: 'USER',
      label: RESOURCE_TYPE_LABELS.USER,
      objects: users.map((user) => ({
        id: String(user._id),
        name: user.username,
        label: user.email ? `${user.username} (${user.email})` : user.username,
      })),
    },
    {
      resourceType: 'GROUP',
      label: RESOURCE_TYPE_LABELS.GROUP,
      objects: groups.map((group) => ({
        id: String(group._id),
        name: group.name,
        label: group.name,
      })),
    },
  ];

  for (const kind of ASSET_KINDS) {
    classes.push({
      resourceType: kind,
      label: RESOURCE_TYPE_LABELS[kind] || kind,
      objects: assets
        .filter((asset) => String(asset.kind).toUpperCase() === kind)
        .map((asset) => ({
          id: String(asset._id),
          name: asset.name,
          label: asset.name,
        })),
    });
  }

  return {
    classes,
    resourceTypes: RESOURCE_TYPES,
    identityTypes: IDENTITY_RESOURCE_TYPES,
    assetKinds: ASSET_KINDS,
  };
}

module.exports = {
  userHasPermission,
  listAccessibleResources,
  listUserPermissions,
  listGroupPermissions,
  listAllPermissions,
  replaceGroupClassPermissions,
  replaceGroupPermissions,
  listPermissionCatalog,
};
