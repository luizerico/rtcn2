const Group = require('../models/Group');
const Permission = require('../models/Permission');
const {
  parsePermissionString,
  actionIsAllowed,
} = require('../constants/rbac');

/**
 * Resolve every group linked to the user (membership + primary roleId).
 */
async function getUserGroupIds(user) {
  if (!user?._id) {
    return [];
  }

  const groupIds = new Set();
  if (user.roleId) {
    groupIds.add(String(user.roleId));
  }

  const memberGroups = await Group.find({ members: user._id }).select('_id');
  for (const group of memberGroups) {
    groupIds.add(String(group._id));
  }

  return [...groupIds];
}

async function getPermissionsForGroups(groupIds) {
  if (!groupIds.length) {
    return [];
  }

  return Permission.find({ groupId: { $in: groupIds } });
}

function collectGrantedActions(permissions, resourceType) {
  const granted = new Set();

  for (const policy of permissions) {
    if (policy.resourceType !== resourceType) {
      continue;
    }
    granted.add(policy.permission);
  }

  return granted;
}

async function userHasPermission(user, permissionString) {
  const parsed = parsePermissionString(permissionString);
  if (!parsed) {
    return false;
  }

  const groupIds = await getUserGroupIds(user);
  const permissions = await getPermissionsForGroups(groupIds);
  const grantedActions = collectGrantedActions(permissions, parsed.resourceType);
  return actionIsAllowed(parsed.action, grantedActions);
}

async function listUserPermissions(user) {
  const groupIds = await getUserGroupIds(user);
  if (!groupIds.length) {
    return [];
  }

  const groups = await Group.find({ _id: { $in: groupIds } }).select('name');
  const groupNameById = new Map(groups.map((group) => [String(group._id), group.name]));
  const permissions = await getPermissionsForGroups(groupIds);

  return permissions.map((policy) => ({
    id: policy._id,
    groupId: policy.groupId,
    groupName: groupNameById.get(String(policy.groupId)) || null,
    resourceType: policy.resourceType,
    target: policy.target,
    permission: policy.permission,
  }));
}

async function listGroupPermissions(groupId) {
  return Permission.find({ groupId }).sort({ resourceType: 1, target: 1, permission: 1 });
}

/**
 * List every permission joined with group name for management screens.
 */
async function listAllPermissions() {
  const permissions = await Permission.find({})
    .sort({ resourceType: 1, target: 1, groupId: 1, permission: 1 })
    .lean();

  if (!permissions.length) {
    return [];
  }

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

/**
 * Replace permissions for a group + resourceType + target with the given scopes.
 */
async function replaceGroupTargetPermissions({
  groupId,
  resourceType,
  target,
  scopes,
}) {
  await Permission.deleteMany({ groupId, resourceType, target });

  if (!scopes.length) {
    return [];
  }

  const docs = scopes.map((permission) => ({
    groupId,
    resourceType,
    target,
    resourceId: null,
    permission,
  }));

  await Permission.insertMany(docs, { ordered: false });
  return listGroupPermissions(groupId);
}

/**
 * Replace all permissions for a group (used by admin bootstrap).
 */
async function replaceGroupPermissions(groupId, permissionDocs) {
  await Permission.deleteMany({ groupId });
  if (!permissionDocs.length) {
    return [];
  }
  await Permission.insertMany(permissionDocs, { ordered: false });
  return listGroupPermissions(groupId);
}

module.exports = {
  getUserGroupIds,
  getPermissionsForGroups,
  userHasPermission,
  listUserPermissions,
  listGroupPermissions,
  listAllPermissions,
  replaceGroupTargetPermissions,
  replaceGroupPermissions,
};
