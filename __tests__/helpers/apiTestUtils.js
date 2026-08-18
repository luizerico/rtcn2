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

/**
 * Seed a Region → State → County chain for subject-scoped survey tests.
 */
async function seedCounty({
  name = 'Testville',
  regionCode,
  stateCode,
  region: existingRegion,
  state: existingState,
  biome,
  microregion,
  IBGECode,
} = {}) {
  const crypto = require('crypto');
  const Region = require('../../api/models/geo/Region');
  const State = require('../../api/models/geo/State');
  const County = require('../../api/models/geo/County');
  const suffix = crypto.randomBytes(3).toString('hex');
  const region =
    existingRegion ||
    (await Region.create({
      code: regionCode || `R${suffix}`,
      name: 'Test Region',
    }));
  const state =
    existingState ||
    (await State.create({
      code: stateCode || `S${suffix}`,
      name: 'TS',
      region: region._id,
    }));
  const county = await County.create({
    name,
    state: state._id,
    region: region._id,
    ...(biome ? { biome: biome._id || biome } : {}),
    ...(microregion ? { microregion: microregion._id || microregion } : {}),
    ...(IBGECode ? { IBGECode } : {}),
  });
  return { region, state, county };
}

module.exports = {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
  createTestApp,
  seedAdminUser,
  seedUnprivilegedUser,
  seedCounty,
};
