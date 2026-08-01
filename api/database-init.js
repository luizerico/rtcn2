const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { ensureAdminBootstrap } = require('./services/adminBootstrap');
const { resolveMongoUri } = require('./config/mongoUri');

dotenv.config();

async function initializeAdmin() {
  const mongoUri = resolveMongoUri();

  if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
    console.error('Initialization failed: MONGODB_URI (or MONGO_URI) is required.');
    process.exit(1);
  }

  if (!process.env.ADMIN_PASSWORD) {
    console.error('Initialization failed: ADMIN_PASSWORD environment variable is required.');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const { adminUser, adminGroup, permissions } = await ensureAdminBootstrap();

    console.log('Admin RBAC bootstrap complete.');
    console.log(`Admin user: ${adminUser.username} (${adminUser.email})`);
    console.log(`Admin group: ${adminGroup.name} with ${permissions.length} permissions`);
    console.log(
      'Admin has full USER/GROUP/ASSET and asset-subclass access (DOCUMENT, DASHBOARD, DATASET, SURVEY, SURVEY_RESPONSE).'
    );

    await mongoose.connection.close();
  } catch (error) {
    console.error('Initialization failed:', error.message);
    if (/auth/i.test(error.message)) {
      console.error(
        'Hint: Docker Mongo needs credentials. Set MONGO_ROOT_USER/MONGO_ROOT_PASS or use:'
      );
      console.error(
        'MONGO_URI=mongodb://root:rootpassword@localhost:27178/projects?authSource=admin'
      );
    }
    process.exit(1);
  }
}

initializeAdmin();
