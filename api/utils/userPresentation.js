const Group = require('../models/Group');

const USER_PUBLIC_EXCLUDE =
  '-password -resetTokenHash -tokenExpiry -verificationTokenHash -verificationTokenExpiry';

/**
 * Attach group membership summaries to user documents for API responses.
 * @param {import('mongoose').Document | object | Array} users
 * @returns {Promise<object | object[]>}
 */
async function attachUserGroups(users) {
  const list = Array.isArray(users) ? users : [users];
  if (!list.length || !list[0]) {
    return Array.isArray(users) ? [] : users;
  }

  const ids = list.map((u) => u._id);
  const groups = await Group.find({
    $or: [{ members: { $in: ids } }, { _id: { $in: list.map((u) => u.roleId).filter(Boolean) } }],
  }).select('_id name members');

  const byUser = new Map();
  for (const user of list) {
    byUser.set(String(user._id), new Map());
  }

  for (const group of groups) {
    const summary = { _id: group._id, name: group.name };
    const memberSet = new Set((group.members || []).map(String));
    for (const user of list) {
      const uid = String(user._id);
      if (memberSet.has(uid) || (user.roleId && String(user.roleId) === String(group._id))) {
        byUser.get(uid).set(String(group._id), summary);
      }
    }
  }

  const enriched = list.map((user) => {
    const plain = typeof user.toObject === 'function' ? user.toObject() : { ...user };
    plain.groups = [...(byUser.get(String(user._id))?.values() || [])];
    return plain;
  });

  return Array.isArray(users) ? enriched : enriched[0];
}

module.exports = {
  USER_PUBLIC_EXCLUDE,
  attachUserGroups,
};
