const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const createApp = require('../../api/app');
const User = require('../../api/models/User');
const { ensureAdminBootstrap } = require('../../api/services/adminBootstrap');

let mongoServer;

async function connectTestDatabase() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}

async function disconnectTestDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongoServer) {
    await mongoServer.stop();
  }
}

async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

function createTestApp() {
  return createApp();
}

/**
 * Seed the admin account with full RBAC permissions and return credentials.
 */
async function seedAdminUser({
  username = 'admin',
  email = 'admin@example.com',
  password = 'AdminPassword123!',
} = {}) {
  const { adminUser, adminGroup } = await ensureAdminBootstrap({
    adminUsername: username,
    adminEmail: email,
    adminPassword: password,
  });

  return { adminUser, adminGroup, password };
}

/**
 * Create a regular user with no group permissions.
 */
async function seedUnprivilegedUser({
  username = 'viewer',
  email = 'viewer@example.com',
  password = 'Password123!',
} = {}) {
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    username,
    email,
    password: hashedPassword,
    isVerified: true,
  });
  return { user, password };
}

module.exports = {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
  createTestApp,
  seedAdminUser,
  seedUnprivilegedUser,
};
