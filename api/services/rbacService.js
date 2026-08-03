const Group = require('../models/Group');
const User = require('../models/User');
const Permission = require('../models/Permission');
const { Asset } = require('../models/Asset');
// Ensure SurveyResponse discriminator is registered before catalog queries.
require('../models/assets');
const SurveyResponse = require('../models/assets/SurveyResponse');
const {
  parsePermissionString,
  actionIsAllowed,
  RESOURCE_TYPES,
  RESOURCE_TYPE_LABELS,
  IDENTITY_RESOURCE_TYPES,
  ASSET_KINDS,
  PERMISSION_RESOURCE_TYPES,
  ACTIONS,
} = require('../constants/rbac');

function formatAnswerPreview(answers, max = 3) {
  const values = (answers || [])
    .map((answer) => String(answer?.value ?? '').trim())
    .filter(Boolean);
  if (!values.length) return 'No answers';
  const shown = values.slice(0, max);
  const extra = values.length > max ? ` (+${values.length - max} more)` : '';
  return `${shown.join(', ')}${extra}`;
}

function buildSurveyResponseMeta({ respondent, surveyName, answers, createdAt }) {
  const survey = surveyName || 'Survey';
  const answeredBy = respondent || 'Unknown user';
  const submittedAt = createdAt ? new Date(createdAt).toISOString() : null;
  return {
    surveyName: survey,
    answeredBy,
    submittedAt,
    answersPreview: formatAnswerPreview(answers),
    /** Simple object name for permissions / ACL target storage. */
    label: survey,
  };
}

function userDisplayName(user) {
  if (!user || typeof user !== 'object') return null;
  return user.username || user.email || null;
}

async function buildAssetOwnerMap(resourceIds = []) {
  const filter = resourceIds.length ? { _id: { $in: resourceIds } } : {};
  const assets = await Asset.find(filter)
    .select('ownerId createdBy')
    .populate('ownerId', 'username email')
    .populate('createdBy', 'username email')
    .lean();

  const owners = new Map();
  for (const asset of assets) {
    const owner =
      userDisplayName(asset.ownerId) || userDisplayName(asset.createdBy) || 'Unknown user';
    owners.set(String(asset._id), owner);
  }
  return owners;
}

async function buildSurveyResponseMetaMap(resourceIds = []) {
  const filter = resourceIds.length ? { _id: { $in: resourceIds } } : {};
  const responses = await SurveyResponse.find(filter)
    .select('name surveyId answers createdBy createdAt')
    .populate('createdBy', 'username email')
    .lean();

  if (!responses.length) return new Map();

  const surveyIds = [...new Set(responses.map((row) => String(row.surveyId)).filter(Boolean))];
  const surveys = surveyIds.length
    ? await Asset.find({ _id: { $in: surveyIds } }).select('name').lean()
    : [];
  const surveyNameById = new Map(surveys.map((survey) => [String(survey._id), survey.name]));

  const metaById = new Map();
  for (const response of responses) {
    const respondent =
      typeof response.createdBy === 'object' && response.createdBy
        ? response.createdBy.username || response.createdBy.email
        : null;
    metaById.set(
      String(response._id),
      buildSurveyResponseMeta({
        respondent,
        surveyName: surveyNameById.get(String(response.surveyId)),
        answers: response.answers,
        createdAt: response.createdAt,
      })
    );
  }
  return metaById;
}

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

function principalQueryForUser(userId, groupIds) {
  const clauses = [{ principalType: 'USER', principalId: userId }];
  if (groupIds.length) {
    clauses.push({ principalType: 'GROUP', principalId: { $in: groupIds } });
    // Legacy rows written before principalType existed.
    clauses.push({
      groupId: { $in: groupIds },
      $or: [{ principalType: { $exists: false } }, { principalType: null }],
    });
  }
  return { $or: clauses };
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
    $or: [
      { principalType: 'GROUP', principalId: groupId },
      { groupId, $or: [{ principalType: { $exists: false } }, { principalType: null }] },
    ],
  }).sort({ resourceType: 1, target: 1, permission: 1 });
}

async function listAllPermissions() {
  const permissions = await Permission.find({
    resourceType: { $in: PERMISSION_RESOURCE_TYPES },
  })
    .sort({ resourceType: 1, target: 1, permission: 1 })
    .lean();

  if (!permissions.length) return [];

  const { userNameById, groupNameById } = await resolvePrincipalNames(permissions);
  const responseIds = permissions
    .filter((row) => row.resourceType === 'SURVEY_RESPONSE' && row.resourceId)
    .map((row) => row.resourceId);
  const surveyIds = permissions
    .filter((row) => row.resourceType === 'SURVEY' && row.resourceId)
    .map((row) => row.resourceId);
  const [responseMeta, surveyOwners] = await Promise.all([
    buildSurveyResponseMetaMap(responseIds),
    buildAssetOwnerMap(surveyIds),
  ]);

  return permissions.map((row) => {
    const principal = normalizePrincipal(row);
    const principalName =
      principal.principalType === 'USER'
        ? userNameById.get(principal.principalId) || 'Unknown user'
        : groupNameById.get(principal.principalId) || 'Unknown group';

    const meta =
      row.resourceType === 'SURVEY_RESPONSE' && row.resourceId
        ? responseMeta.get(String(row.resourceId))
        : null;

    const owner =
      row.resourceType === 'SURVEY' && row.resourceId
        ? surveyOwners.get(String(row.resourceId)) || null
        : null;

    return {
      _id: row._id,
      principalType: principal.principalType,
      principalId: principal.principalId,
      principalName,
      groupId: principal.principalType === 'GROUP' ? principal.principalId : null,
      groupName: principal.principalType === 'GROUP' ? principalName : null,
      resourceType: row.resourceType,
      target: meta?.label || row.target,
      resourceId: row.resourceId,
      permission: row.permission,
      answeredBy: meta?.answeredBy || null,
      submittedAt: meta?.submittedAt || null,
      owner: owner,
    };
  });
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

async function replaceGroupClassPermissions({
  groupId,
  resourceType,
  scopes,
  allObjects = false,
  objects = [],
}) {
  await Permission.deleteMany({
    resourceType,
    $or: [
      { principalType: 'GROUP', principalId: groupId },
      { groupId },
    ],
  });
  if (!scopes.length) return [];

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

async function listPermissionCatalog() {
  const [users, groups, assets, responseMeta] = await Promise.all([
    User.find({}).select('username email').sort({ username: 1 }).lean(),
    Group.find({}).select('name').sort({ name: 1 }).lean(),
    Asset.find({})
      .select('name kind createdAt ownerId createdBy')
      .populate('ownerId', 'username email')
      .populate('createdBy', 'username email')
      .sort({ name: 1 })
      .lean(),
    buildSurveyResponseMetaMap(),
  ]);

  const classes = PERMISSION_RESOURCE_TYPES.map((kind) => ({
    resourceType: kind,
    label: RESOURCE_TYPE_LABELS[kind] || kind,
    objects: assets
      .filter((asset) => String(asset.kind).toUpperCase() === kind)
      .map((asset) => {
        const id = String(asset._id);
        if (kind === 'SURVEY_RESPONSE') {
          const meta = responseMeta.get(id);
          const surveyName = meta?.surveyName || asset.name || 'Survey response';
          const answeredBy = meta?.answeredBy || null;
          const submittedAt = meta?.submittedAt || null;
          return {
            id,
            name: surveyName,
            label: surveyName,
            answeredBy,
            submittedAt,
            detail: [answeredBy, submittedAt ? new Date(submittedAt).toLocaleString() : null]
              .filter(Boolean)
              .join(' · '),
          };
        }
        if (kind === 'SURVEY') {
          const owner =
            userDisplayName(asset.ownerId) || userDisplayName(asset.createdBy) || null;
          return {
            id,
            name: asset.name,
            label: asset.name,
            owner,
            detail: owner ? `Owner: ${owner}` : undefined,
          };
        }
        return {
          id,
          name: asset.name,
          label: asset.name,
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

  const legacy = await Permission.find({
    $or: [{ principalType: { $exists: false } }, { principalType: null }, { principalId: { $exists: false } }],
  });

  for (const row of legacy) {
    if (!row.groupId) {
      await Permission.deleteOne({ _id: row._id });
      continue;
    }
    row.principalType = 'GROUP';
    row.principalId = row.groupId;
    await row.save();
  }

  return legacy.length;
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
};
