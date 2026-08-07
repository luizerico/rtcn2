const Group = require('../models/Group');
const User = require('../models/User');
const Permission = require('../models/Permission');
const { Asset } = require('../models/Asset');
// Ensure SurveyResponse discriminator is registered before catalog queries.
require('../models/assets');
const SurveyResponse = require('../models/assets/SurveyResponse');
const {
  RESOURCE_TYPE_LABELS,
  ASSET_KINDS,
  PERMISSION_RESOURCE_TYPES,
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

module.exports = {
  buildAssetOwnerMap,
  buildSurveyResponseMetaMap,
  listAllPermissions,
  listPermissionCatalog,
  normalizePrincipal,
  resolvePrincipalNames,
  userDisplayName,
};
