const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Session = require('../models/Session');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseExpiryToMs(expireValue = '1h') {
  const match = String(expireValue).trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    return 60 * 60 * 1000;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return amount * multipliers[unit];
}

async function createSession({
  user,
  userAgent = '',
  ipAddress = '',
  clientApp = 'rbac-platform',
}) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured.');
  }

  const sessionId = crypto.randomUUID();
  const expiresIn = process.env.JWT_EXPIRE || '1h';
  const expiresAt = new Date(Date.now() + parseExpiryToMs(expiresIn));

  const token = jwt.sign(
    {
      id: user._id,
      username: user.username,
      sid: sessionId,
    },
    secret,
    { expiresIn }
  );

  const session = await Session.create({
    sessionId,
    userId: user._id,
    username: user.username,
    tokenHash: hashToken(token),
    userAgent,
    ipAddress,
    clientApp,
    expiresAt,
    lastSeenAt: new Date(),
  });

  return { token, session };
}

async function findActiveSession(sessionId) {
  if (!sessionId) return null;

  const session = await Session.findOne({ sessionId });
  if (!session) return null;
  if (session.revokedAt) return session;
  if (session.expiresAt.getTime() <= Date.now()) return session;
  return session;
}

async function touchSession(session) {
  session.lastSeenAt = new Date();
  await session.save();
}

async function revokeSession(sessionId, reason = 'revoked') {
  const session = await Session.findOne({ sessionId });
  if (!session) return null;
  if (!session.revokedAt) {
    session.revokedAt = new Date();
    session.revokeReason = reason;
    await session.save();
  }
  return session;
}

async function revokeAllUserSessions(userId, reason = 'password_changed') {
  await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: reason } }
  );
}

async function listActiveSessions() {
  return Session.find({
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastSeenAt: -1 })
    .select('-tokenHash');
}

async function listUserSessions(userId) {
  return Session.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastSeenAt: -1 })
    .select('-tokenHash');
}

const SESSION_SORT_FIELDS = new Set([
  'username',
  'clientApp',
  'ipAddress',
  'lastSeenAt',
  'expiresAt',
  'createdAt',
]);

/**
 * Paginated session list with search/filter.
 * @param {Record<string, unknown>} query
 * @param {{ userId?: import('mongoose').Types.ObjectId | string | null }} options
 */
async function querySessions(query = {}, { userId = null } = {}) {
  const {
    parseListQuery,
    clampPage,
    paginatedResponse,
    textSearchOr,
    escapeRegex,
  } = require('../utils/listQuery');

  const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
    query,
    SESSION_SORT_FIELDS,
    'lastSeenAt'
  );

  const filter = {
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  };

  if (userId) {
    filter.userId = userId;
  }

  const qOr = textSearchOr(['username', 'clientApp', 'ipAddress', 'userAgent'], query.q);
  if (qOr) filter.$or = qOr;

  if (query.username) {
    filter.username = { $regex: escapeRegex(String(query.username).trim()), $options: 'i' };
  }
  if (query.clientApp) {
    filter.clientApp = { $regex: escapeRegex(String(query.clientApp).trim()), $options: 'i' };
  }

  const total = await Session.countDocuments(filter);
  const { page, skip } = clampPage(rawPage, total, limit);

  const items = await Session.find(filter)
    .select('-tokenHash')
    .sort({ [sortField]: sortOrder, _id: sortOrder })
    .skip(skip)
    .limit(limit)
    .lean();

  return paginatedResponse({
    items,
    total,
    page,
    limit,
    sortField,
    orderLabel,
  });
}

module.exports = {
  hashToken,
  createSession,
  findActiveSession,
  touchSession,
  revokeSession,
  revokeAllUserSessions,
  listActiveSessions,
  listUserSessions,
  querySessions,
};
