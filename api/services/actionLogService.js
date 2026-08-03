const mongoose = require('mongoose');
const ActionLog = require('../models/ActionLog');

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'authorization',
  'resetToken',
  'currentPassword',
  'newPassword',
  'confirmPassword',
]);

const SORTABLE_FIELDS = new Set([
  'createdAt',
  'username',
  'action',
  'resourceType',
  'method',
  'statusCode',
  'success',
]);

const RESOURCE_ALIASES = {
  auth: 'AUTH',
  users: 'USER',
  groups: 'GROUP',
  assets: 'ASSET',
  surveys: 'SURVEY',
  permissions: 'PERMISSION',
  logs: 'LOG',
};

function sanitizeMeta(value, depth = 0) {
  if (value == null || depth > 4) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeMeta(item, depth + 1));
  }
  if (typeof value !== 'object') {
    if (typeof value === 'string' && value.length > 500) {
      return `${value.slice(0, 500)}…`;
    }
    return value;
  }

  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = '[redacted]';
      continue;
    }
    const cleaned = sanitizeMeta(nested, depth + 1);
    if (cleaned !== undefined) {
      out[key] = cleaned;
    }
  }
  return out;
}

function pathSegments(path) {
  const clean = String(path || '')
    .split('?')[0]
    .replace(/^\/api\/?/, '/')
    .replace(/\/+/g, '/');
  return clean.split('/').filter(Boolean);
}

function looksLikeObjectId(value) {
  return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);
}

function deriveResource(path) {
  const parts = pathSegments(path);
  if (!parts.length) {
    return { resourceType: 'UNKNOWN', resourceId: null };
  }

  const root = parts[0].toLowerCase();
  const resourceType = RESOURCE_ALIASES[root] || root.toUpperCase();

  let resourceId = null;
  if (parts[1] && looksLikeObjectId(parts[1])) {
    resourceId = parts[1];
  } else if (parts[1] && parts[2] && looksLikeObjectId(parts[2])) {
    resourceId = parts[2];
  } else if (parts[1] && !['members', 'permissions', 'password', 'sessions', 'responses'].includes(parts[1])) {
    resourceId = parts[1];
  }

  return { resourceType, resourceId };
}

function deriveAction(method, path) {
  const parts = pathSegments(path);
  const root = (parts[0] || '').toLowerCase();
  const leaf = (parts[parts.length - 1] || '').toLowerCase();
  const upperMethod = String(method || 'GET').toUpperCase();

  if (root === 'auth') {
    if (leaf === 'login') return 'auth.login';
    if (leaf === 'logout') return 'auth.logout';
    if (leaf === 'register') return 'auth.register';
    if (leaf === 'change-password') return 'auth.change_password';
    if (leaf === 'forgot-password') return 'auth.forgot_password';
    if (parts.includes('reset-password')) return 'auth.reset_password';
    if (parts.includes('sessions') && upperMethod === 'DELETE') return 'auth.session_disconnect';
    return `auth.${leaf || upperMethod.toLowerCase()}`;
  }

  if (parts.includes('members')) {
    if (upperMethod === 'POST') return 'group.member_add';
    if (upperMethod === 'DELETE') return 'group.member_remove';
  }
  if (parts.includes('permissions')) {
    if (upperMethod === 'POST' || upperMethod === 'PUT') return 'permission.set';
    if (upperMethod === 'DELETE') return 'permission.remove';
  }
  if (parts.includes('password') && upperMethod === 'POST') {
    return 'user.password_change';
  }
  if (parts.includes('responses') && upperMethod === 'POST') {
    return 'survey.response_submit';
  }

  const verb =
    {
      POST: 'create',
      PUT: 'update',
      PATCH: 'update',
      DELETE: 'delete',
      GET: 'read',
    }[upperMethod] || upperMethod.toLowerCase();

  const resource = RESOURCE_ALIASES[root]
    ? RESOURCE_ALIASES[root].toLowerCase()
    : root.replace(/s$/, '') || 'resource';

  return `${resource}.${verb}`;
}

function buildMessage({ action, username, method, path, statusCode }) {
  const actor = username || 'anonymous';
  return `${actor} ${action} ${method} ${path} → ${statusCode}`;
}

/**
 * Persist an action log entry. Never throws to callers — logging must not break requests.
 */
async function recordAction(entry = {}) {
  try {
    const method = String(entry.method || 'GET').toUpperCase();
    const path = entry.path || '/';
    const derived = deriveResource(path);
    const action = entry.action || deriveAction(method, path);
    const statusCode = Number(entry.statusCode) || 0;
    const username = entry.username || '';

    await ActionLog.create({
      userId: entry.userId || null,
      username,
      action,
      resourceType: entry.resourceType || derived.resourceType,
      resourceId: entry.resourceId != null ? String(entry.resourceId) : derived.resourceId,
      method,
      path,
      statusCode,
      success: entry.success != null ? Boolean(entry.success) : statusCode >= 200 && statusCode < 400,
      message: entry.message || buildMessage({ action, username, method, path, statusCode }),
      ipAddress: entry.ipAddress || '',
      userAgent: entry.userAgent || '',
      clientApp: entry.clientApp || 'rbac-platform',
      meta: sanitizeMeta(entry.meta) || {},
    });
  } catch (error) {
    console.error('Action log write failed:', error.message);
  }
}

function parseBoolean(value) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

/**
 * Backend search / filter / order / pagination for action logs.
 */
async function queryActionLogs(query = {}) {
  const filter = {};

  if (query.username) {
    filter.username = { $regex: String(query.username).trim(), $options: 'i' };
  }
  if (query.userId && mongoose.Types.ObjectId.isValid(query.userId)) {
    filter.userId = query.userId;
  }
  if (query.action) {
    filter.action = { $regex: String(query.action).trim(), $options: 'i' };
  }
  if (query.resourceType) {
    filter.resourceType = String(query.resourceType).trim().toUpperCase();
  }
  if (query.resourceId) {
    filter.resourceId = String(query.resourceId).trim();
  }
  if (query.method) {
    filter.method = String(query.method).trim().toUpperCase();
  }
  if (query.statusCode != null && query.statusCode !== '') {
    const code = Number(query.statusCode);
    if (!Number.isNaN(code)) filter.statusCode = code;
  }
  const success = parseBoolean(query.success);
  if (success !== undefined) {
    filter.success = success;
  }
  if (query.clientApp) {
    filter.clientApp = String(query.clientApp).trim();
  }

  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) {
      const from = new Date(query.from);
      if (!Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
    }
    if (query.to) {
      const to = new Date(query.to);
      if (!Number.isNaN(to.getTime())) filter.createdAt.$lte = to;
    }
    if (!Object.keys(filter.createdAt).length) {
      delete filter.createdAt;
    }
  }

  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (q) {
    filter.$or = [
      { username: { $regex: q, $options: 'i' } },
      { action: { $regex: q, $options: 'i' } },
      { resourceType: { $regex: q, $options: 'i' } },
      { path: { $regex: q, $options: 'i' } },
      { message: { $regex: q, $options: 'i' } },
      { resourceId: { $regex: q, $options: 'i' } },
    ];
  }

  const sortField = SORTABLE_FIELDS.has(query.sort) ? query.sort : 'createdAt';
  const sortOrder = String(query.order || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  let page = Math.max(1, Number(query.page) || 1);

  const total = await ActionLog.countDocuments(filter);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  if (totalPages > 0 && page > totalPages) {
    page = totalPages;
  }
  const skip = (page - 1) * limit;

  const items = await ActionLog.find(filter)
    .sort({ [sortField]: sortOrder, _id: sortOrder })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: totalPages > 0 && page < totalPages,
    },
    sort: { field: sortField, order: sortOrder === 1 ? 'asc' : 'desc' },
  };
}

async function listDistinctActions() {
  return ActionLog.distinct('action');
}

async function listDistinctResourceTypes() {
  return ActionLog.distinct('resourceType');
}

module.exports = {
  recordAction,
  queryActionLogs,
  listDistinctActions,
  listDistinctResourceTypes,
  sanitizeMeta,
  deriveAction,
  deriveResource,
  SORTABLE_FIELDS,
};
