const Group = require('../models/Group');
const User = require('../models/User');
const Permission = require('../models/Permission');
const { findAssets } = require('../models/assets');
const {
  RESOURCE_TYPE_LABELS,
  ASSET_KINDS,
  PERMISSION_RESOURCE_TYPES,
} = require('../constants/rbac');

function userDisplayName(user) {
  if (!user || typeof user !== 'object') return null;
  return user.username || user.email || null;
}

async function buildAssetOwnerMap(resourceIds = []) {
  const filter = resourceIds.length ? { _id: { $in: resourceIds } } : {};
  const assets = await findAssets(filter, {
    populate: [
      ['ownerId', 'username email'],
      ['createdBy', 'username email'],
    ],
  });

  const owners = new Map();
  for (const asset of assets) {
    const owner =
      userDisplayName(asset.ownerId) || userDisplayName(asset.createdBy) || 'Unknown user';
    owners.set(String(asset._id), owner);
  }
  return owners;
}

function normalizePrincipal(policy) {
  if (policy.principalType && policy.principalId) {
    return {
      principalType: policy.principalType,
      principalId: String(policy.principalId),
    };
  }
  return {
    principalType: 'GROUP',
    principalId: String(policy.groupId),
  };
}

async function resolvePrincipalNames(rows) {
  const userIds = [
    ...new Set(
      rows
        .filter((row) => normalizePrincipal(row).principalType === 'USER')
        .map((row) => normalizePrincipal(row).principalId)
    ),
  ];
  const groupIds = [
    ...new Set(
      rows
        .filter((row) => normalizePrincipal(row).principalType === 'GROUP')
        .map((row) => normalizePrincipal(row).principalId)
    ),
  ];

  const [users, groups] = await Promise.all([
    userIds.length ? User.find({ _id: { $in: userIds } }).select('username email').lean() : [],
    groupIds.length ? Group.find({ _id: { $in: groupIds } }).select('name').lean() : [],
  ]);

  const userNameById = new Map(
    users.map((user) => [
      String(user._id),
      user.email ? `${user.username} (${user.email})` : user.username,
    ])
  );
  const groupNameById = new Map(groups.map((group) => [String(group._id), group.name]));

  return { userNameById, groupNameById };
}

async function listAllPermissions() {
  const permissions = await Permission.find({
    resourceType: { $in: PERMISSION_RESOURCE_TYPES },
  })
    .sort({ resourceType: 1, target: 1, permission: 1 })
    .lean();

  if (!permissions.length) return [];

  const { userNameById, groupNameById } = await resolvePrincipalNames(permissions);
  const surveyIds = permissions.filter((row) => row.resourceId).map((row) => row.resourceId);
  const surveyOwners = await buildAssetOwnerMap(surveyIds);

  return permissions.map((row) => {
    const principal = normalizePrincipal(row);
    const principalName =
      principal.principalType === 'USER'
        ? userNameById.get(principal.principalId) || 'Unknown user'
        : groupNameById.get(principal.principalId) || 'Unknown group';

    const owner = row.resourceId ? surveyOwners.get(String(row.resourceId)) || null : null;

    return {
      _id: row._id,
      principalType: principal.principalType,
      principalId: principal.principalId,
      principalName,
      groupId: principal.principalType === 'GROUP' ? principal.principalId : null,
      groupName: principal.principalType === 'GROUP' ? principalName : null,
      resourceType: row.resourceType,
      target: row.target,
      resourceId: row.resourceId,
      permission: row.permission,
      owner,
    };
  });
}

async function listPermissionCatalog() {
  const [users, groups, assets] = await Promise.all([
    User.find({}).select('username email').sort({ username: 1 }).lean(),
    Group.find({}).select('name').sort({ name: 1 }).lean(),
    findAssets(
      {},
      {
        populate: [
          ['ownerId', 'username email'],
          ['createdBy', 'username email'],
        ],
        sort: { name: 1 },
      }
    ),
  ]);

  const classes = PERMISSION_RESOURCE_TYPES.map((kind) => ({
    resourceType: kind,
    label: RESOURCE_TYPE_LABELS[kind] || kind,
    objects: assets
      .filter((asset) => String(asset.kind).toUpperCase() === kind)
      .map((asset) => {
        const owner =
          userDisplayName(asset.ownerId) || userDisplayName(asset.createdBy) || null;
        return {
          id: String(asset._id),
          name: asset.name,
          label: asset.name,
          owner,
          detail: owner ? `Owner: ${owner}` : undefined,
        };
      }),
  }));

  return {
    classes,
    resourceTypes: PERMISSION_RESOURCE_TYPES,
    assetKinds: ASSET_KINDS,
    principals: {
      users: users.map((user) => ({
        id: String(user._id),
        name: user.username,
        label: user.email ? `${user.username} (${user.email})` : user.username,
        principalType: 'USER',
      })),
      groups: groups.map((group) => ({
        id: String(group._id),
        name: group.name,
        label: group.name,
        principalType: 'GROUP',
      })),
    },
  };
}

module.exports = {
  buildAssetOwnerMap,
  listAllPermissions,
  listPermissionCatalog,
  normalizePrincipal,
  resolvePrincipalNames,
  userDisplayName,
};
