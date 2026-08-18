const User = require('../models/User');
const Group = require('../models/Group');
const Organization = require('../models/Organization');
const bcrypt = require('bcryptjs');
const { assertPasswordPolicy } = require('../utils/passwordPolicy');
const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');
const { USER_PUBLIC_EXCLUDE, attachUserGroups } = require('../utils/userPresentation');
const { revokeAllUserSessions } = require('../services/sessionService');
const { activeFilter, applyTrash } = require('../services/trash');
const {
  parseListQuery,
  clampPage,
  paginatedResponse,
  textSearchOr,
  escapeRegex,
} = require('../utils/listQuery');
const { optionalObjectId, optionalString, booleanFlag, ValidationError, nonEmptyString, emailString } = require('../validation');

const USER_SORT_FIELDS = new Set([
  'username',
  'email',
  'createdAt',
  'lastLoginAt',
  'isVerified',
  'isEnabled',
]);

async function resolveActiveOrganization(id) {
  if (!id) return null;
  const org = await Organization.findOne(activeFilter({ _id: id })).select('_id');
  if (!org) {
    const error = new Error('Organization not found.');
    error.status = 400;
    throw error;
  }
  return org._id;
}

exports.getAllUsers = async (req, res) => {
  try {
    const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
      req.query,
      USER_SORT_FIELDS,
      'createdAt'
    );

    const filter = activeFilter();
    const qOr = textSearchOr(['username', 'email'], req.query.q);
    if (qOr) filter.$or = qOr;

    if (req.query.username) {
      filter.username = { $regex: escapeRegex(String(req.query.username).trim()), $options: 'i' };
    }
    if (req.query.email) {
      filter.email = { $regex: escapeRegex(String(req.query.email).trim()), $options: 'i' };
    }

    if (req.query.isVerified === 'true' || req.query.isVerified === 'false') {
      filter.isVerified = req.query.isVerified === 'true';
    }
    if (req.query.isEnabled === 'true' || req.query.isEnabled === 'false') {
      filter.isEnabled = req.query.isEnabled === 'true';
    }

    const organizationId =
      typeof req.query.organizationId === 'string' ? req.query.organizationId.trim() : '';
    if (organizationId) {
      filter.organization = organizationId;
    }

    const groupId = typeof req.query.groupId === 'string' ? req.query.groupId.trim() : '';
    if (groupId) {
      const group = await Group.findOne(activeFilter({ _id: groupId })).select('members');
      if (!group) {
        return res.status(200).json(
          paginatedResponse({
            items: [],
            total: 0,
            page: 1,
            limit,
            sortField,
            orderLabel,
          })
        );
      }
      const memberIds = [...(group.members || [])];
      filter._id = { $in: memberIds };
    }

    const total = await User.countDocuments(filter);
    const { page, skip } = clampPage(rawPage, total, limit);

    const users = await User.find(filter)
      .select(USER_PUBLIC_EXCLUDE)
      .sort({ [sortField]: sortOrder, _id: sortOrder })
      .skip(skip)
      .limit(limit);

    const withGroups = await attachUserGroups(users);

    res.status(200).json(
      paginatedResponse({
        items: withGroups,
        total,
        page,
        limit,
        sortField,
        orderLabel,
      })
    );
  } catch (error) {
    if (error?.name === 'ValidationError' || error?.status === 400) {
      return sendError(res, 400, error.message, ERROR_CODES.VALIDATION);
    }
    return sendServerError(res, error, 'Error fetching users');
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findOne(activeFilter({ _id: req.params.id })).select(USER_PUBLIC_EXCLUDE);
    if (!user) {
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND);
    }
    const withGroups = await attachUserGroups(user);
    res.status(200).json(withGroups);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching user');
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, email, password, organization, language } = req.validated || req.body;

    const passwordCheck = assertPasswordPolicy(password);
    if (!passwordCheck.ok) {
      return sendError(res, 400, passwordCheck.message, ERROR_CODES.VALIDATION);
    }

    const existing = await User.findOne(activeFilter({ $or: [{ username }, { email }] }));
    if (existing) {
      return sendError(res, 400, 'User or email already exists.', ERROR_CODES.CONFLICT);
    }

    const organizationId = await resolveActiveOrganization(organization);

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      isVerified: true,
      isEnabled: true,
      organization: organizationId,
      ...(language ? { language } : {}),
    });

    const withGroups = await attachUserGroups(
      await User.findById(user._id).select(USER_PUBLIC_EXCLUDE)
    );

    res.status(201).json(withGroups);
  } catch (error) {
    if (error?.status === 400) {
      return sendError(res, 400, error.message, ERROR_CODES.VALIDATION);
    }
    return sendServerError(res, error, 'Error creating user');
  }
};

const USER_UPDATE_ALLOWED = ['username', 'email', 'isVerified', 'isEnabled', 'organization', 'language'];

exports.updateUser = async (req, res) => {
  try {
    const updates = {};
    for (const key of USER_UPDATE_ALLOWED) {
      if (!Object.prototype.hasOwnProperty.call(req.body, key)) continue;
      if (key === 'isVerified' || key === 'isEnabled') {
        try {
          updates[key] = booleanFlag(req.body[key], { defaultValue: undefined });
        } catch (error) {
          if (error instanceof ValidationError) {
            return sendError(res, 400, `${key} must be a boolean.`, ERROR_CODES.VALIDATION);
          }
          throw error;
        }
        if (typeof updates[key] !== 'boolean') {
          return sendError(res, 400, `${key} must be a boolean.`, ERROR_CODES.VALIDATION);
        }
        continue;
      }
      if (key === 'organization') {
        try {
          updates.organization = await resolveActiveOrganization(
            optionalObjectId(req.body.organization, 'Organization')
          );
        } catch (error) {
          if (error instanceof ValidationError || error?.status === 400) {
            return sendError(res, 400, error.message, ERROR_CODES.VALIDATION);
          }
          throw error;
        }
        continue;
      }
      if (key === 'language') {
        try {
          const language = optionalString(req.body.language, 'Language', { maxLength: 10 });
          updates.language = language || null;
        } catch (error) {
          if (error instanceof ValidationError) {
            return sendError(res, 400, error.message, ERROR_CODES.VALIDATION);
          }
          throw error;
        }
        continue;
      }
      if (key === 'username') {
        try {
          updates.username = nonEmptyString(req.body.username, 'Username', { maxLength: 64 });
        } catch (error) {
          if (error instanceof ValidationError) {
            return sendError(res, 400, error.message, ERROR_CODES.VALIDATION);
          }
          throw error;
        }
        continue;
      }
      if (key === 'email') {
        try {
          updates.email = emailString(req.body.email);
        } catch (error) {
          if (error instanceof ValidationError) {
            return sendError(res, 400, error.message, ERROR_CODES.VALIDATION);
          }
          throw error;
        }
        continue;
      }
      updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: `No updatable fields provided. Allowed: ${USER_UPDATE_ALLOWED.join(', ')}.`,
      });
    }

    if (updates.username || updates.email) {
      const clashFilter = {
        _id: { $ne: req.params.id },
        $or: [
          ...(updates.username ? [{ username: updates.username }] : []),
          ...(updates.email ? [{ email: updates.email }] : []),
        ],
      };
      const clash = await User.findOne(activeFilter(clashFilter)).select('_id');
      if (clash) {
        return sendError(res, 400, 'User or email already exists.', ERROR_CODES.CONFLICT);
      }
    }

    if (updates.isEnabled === false && String(req.params.id) === String(req.user._id)) {
      return sendError(res, 400, 'You cannot disable your own account.', ERROR_CODES.BAD_REQUEST);
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'isVerified')) {
      if (updates.isVerified) {
        updates.verificationTokenHash = null;
        updates.verificationTokenExpiry = null;
      }
    }

    const user = await User.findOneAndUpdate(activeFilter({ _id: req.params.id }), updates, {
      returnDocument: 'after',
      runValidators: true,
    }).select(USER_PUBLIC_EXCLUDE);

    if (!user) {
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND);
    }

    if (updates.isVerified === false || updates.isEnabled === false) {
      const reason = updates.isEnabled === false ? 'account_disabled' : 'verification_revoked';
      await revokeAllUserSessions(user._id, reason);
    }

    const withGroups = await attachUserGroups(user);
    res.status(200).json(withGroups);
  } catch (error) {
    if (error?.status === 400) {
      return sendError(res, 400, error.message, ERROR_CODES.VALIDATION);
    }
    return sendServerError(res, error, 'Error updating user');
  }
};

exports.deleteUser = async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user._id)) {
      return sendError(res, 400, 'You cannot move your own account to the recycle bin.', ERROR_CODES.BAD_REQUEST);
    }
    const user = await User.findOne(activeFilter({ _id: req.params.id }));
    if (!user) {
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND);
    }
    applyTrash(user, req.user._id);
    await user.save();
    await revokeAllUserSessions(user._id, 'user_deleted');
    res.status(200).json({ message: 'User moved to recycle bin.' });
  } catch (error) {
    return sendServerError(res, error, 'Error deleting user');
  }
};
