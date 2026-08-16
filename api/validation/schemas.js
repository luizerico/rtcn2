const {
  requireFields,
  nonEmptyString,
  objectId,
  password,
  emailString,
  parsePagination,
  oneOf,
  booleanFlag,
  ValidationError,
} = require('./index');
const { PERMISSION_RESOURCE_TYPES } = require('../constants/rbac');

const PERMISSION_SCOPES = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN'];
const ASSET_KINDS = ['DOCUMENT', 'DASHBOARD', 'DATASET'];

/** Auth: POST /api/auth/register */
function registerBody(req) {
  requireFields(req.body, ['username', 'email', 'password'], {
    message: 'Please include all fields.',
  });
  return {
    username: nonEmptyString(req.body.username, 'Username', { maxLength: 64 }),
    email: emailString(req.body.email),
    password: password(req.body.password, { label: 'Password', minLength: 8 }),
  };
}

/** Auth: POST /api/auth/login */
function loginBody(req) {
  requireFields(req.body, ['email', 'password'], {
    message: 'Please provide email and password.',
  });
  return {
    email: emailString(req.body.email),
    password: String(req.body.password),
  };
}

/** Auth: POST /api/auth/change-password */
function changePasswordBody(req) {
  requireFields(req.body, ['currentPassword', 'newPassword'], {
    message: 'Current password and new password are required.',
  });
  return {
    currentPassword: String(req.body.currentPassword),
    newPassword: password(req.body.newPassword, { label: 'New password', minLength: 8 }),
  };
}

/** Auth: POST /api/auth/reset-password/:token */
function resetPasswordBody(req) {
  requireFields(req.body, ['newPassword'], {
    message: 'New password is required.',
  });
  return {
    token: nonEmptyString(req.params.token, 'Reset token'),
    newPassword: password(req.body.newPassword, { label: 'New password', minLength: 8 }),
  };
}

/** Auth: GET /api/auth/forgot-password?email= */
function forgotPasswordQuery(req) {
  return {
    email: emailString(req.query.email, 'Email'),
  };
}

/** Users: POST /api/users */
function createUserBody(req) {
  requireFields(req.body, ['username', 'email', 'password'], {
    message: 'Username, email, and password are required.',
  });
  return {
    username: nonEmptyString(req.body.username, 'Username', { maxLength: 64 }),
    email: emailString(req.body.email),
    password: password(req.body.password, { label: 'Password', minLength: 8 }),
  };
}

/** Users: POST /api/users/:id/password */
function adminPasswordBody(req) {
  return {
    id: objectId(req.params.id, 'User id'),
    newPassword: password(req.body?.newPassword, { label: 'New password', minLength: 8 }),
  };
}

/** Groups: POST /api/groups */
function createGroupBody(req) {
  return {
    name: nonEmptyString(req.body?.name, 'Group name', { maxLength: 128 }),
    description:
      req.body?.description === undefined || req.body?.description === null
        ? ''
        : String(req.body.description),
  };
}

/** Membership: add/remove member */
function groupMemberBody(req) {
  return {
    groupId: objectId(req.params.groupId, 'Group id'),
    targetUserId: objectId(req.body?.targetUserId, 'Target User ID'),
  };
}

/** Membership: update group permissions */
function groupPermissionsBody(req) {
  const scopes = req.body?.scopes;
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new ValidationError('At least one permission scope is required.');
  }

  const resourceType = oneOf(req.body?.resourceType, PERMISSION_RESOURCE_TYPES, 'resource type', {
    normalize: (v) => String(v || '').toUpperCase(),
  });

  const invalidScopes = scopes.filter((scope) => !PERMISSION_SCOPES.includes(scope));
  if (invalidScopes.length > 0) {
    throw new ValidationError(`Invalid scopes: ${invalidScopes.join(', ')}`);
  }

  const allObjects = booleanFlag(req.body?.allObjects, { defaultValue: false });
  const objects = Array.isArray(req.body?.objects) ? req.body.objects : [];
  const selectedObjects = objects.filter((o) => o && (o.id || o.resourceId));

  if (!allObjects && selectedObjects.length === 0) {
    throw new ValidationError(
      'Select all objects of this class, or one or more existing database objects.'
    );
  }

  return {
    groupId: objectId(req.params.groupId, 'Group id'),
    scopes,
    resourceType,
    allObjects,
    objects: selectedObjects,
  };
}

const DEDICATED_ASSET_APIS = {
  SURVEY: 'Use the surveys API to create Survey assets.',
  SPONSOR: 'Use the sponsors API to create Sponsor assets.',
  OPPORTUNITY: 'Use the opportunities API to create Opportunity assets.',
  PROJECT: 'Use the projects API to create Project assets.',
};

/** Assets: POST /api/assets */
function createAssetBody(req) {
  const name = nonEmptyString(req.body?.name, 'Asset name', { maxLength: 200 });
  const kind = String(req.body?.kind || 'DOCUMENT').toUpperCase();
  if (DEDICATED_ASSET_APIS[kind]) {
    throw new ValidationError(DEDICATED_ASSET_APIS[kind]);
  }
  if (!ASSET_KINDS.includes(kind)) {
    throw new ValidationError('Invalid asset kind.');
  }
  return {
    name,
    description: req.body?.description == null ? '' : String(req.body.description),
    kind,
  };
}

/** Action logs list query */
function actionLogQuery(req) {
  return {
    pagination: parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 }),
  };
}

/** Param id helpers */
function paramObjectId(paramName = 'id', label) {
  return (req) => ({ [paramName]: objectId(req.params[paramName], label || paramName) });
}

module.exports = {
  PERMISSION_SCOPES,
  ASSET_KINDS,
  registerBody,
  loginBody,
  changePasswordBody,
  resetPasswordBody,
  forgotPasswordQuery,
  createUserBody,
  adminPasswordBody,
  createGroupBody,
  groupMemberBody,
  groupPermissionsBody,
  createAssetBody,
  actionLogQuery,
  paramObjectId,
};
