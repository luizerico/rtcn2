const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Group = require('../models/Group');
const { buildFullAdminPermissions } = require('../constants/rbac');
const { replaceGroupPermissions, listGroupPermissions } = require('./rbacService');

/**
 * Ensure the admin group has full RBAC coverage and the admin user is linked.
 * Permissions are stored in the standalone permissions collection.
 */
async function ensureAdminBootstrap({
  adminUsername = process.env.ADMIN_USERNAME || 'admin',
  adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword = process.env.ADMIN_PASSWORD,
} = {}) {
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD is required to bootstrap the admin account.');
  }

  let adminGroup = await Group.findOne({ name: 'admin' });
  if (!adminGroup) {
    adminGroup = await Group.create({
      name: 'admin',
      description: 'Administrator Group - Full System Access',
      members: [],
    });
  } else {
    adminGroup.description = 'Administrator Group - Full System Access';
    await adminGroup.save();
  }

  const fullPermissions = buildFullAdminPermissions(adminGroup._id);
  const permissions = await replaceGroupPermissions(adminGroup._id, fullPermissions);

  let adminUser = await User.findOne({ username: adminUsername });
  if (!adminUser) {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    adminUser = await User.create({
      username: adminUsername,
      email: adminEmail,
      password: hashedPassword,
      roleId: adminGroup._id,
      isVerified: true,
    });
  } else {
    adminUser.email = adminEmail;
    adminUser.roleId = adminGroup._id;
    adminUser.isVerified = true;
    await adminUser.save();
  }

  await Group.findByIdAndUpdate(adminGroup._id, {
    $addToSet: { members: adminUser._id },
  });

  return {
    adminUser,
    adminGroup,
    permissions: permissions.length ? permissions : await listGroupPermissions(adminGroup._id),
  };
}

module.exports = {
  ensureAdminBootstrap,
};
