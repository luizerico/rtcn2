const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Group = require('./models/Group');

async function initializeAdmin() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!mongoUri) {
    console.error('Initialization failed: MONGODB_URI (or MONGO_URI) is required.');
    process.exit(1);
  }

  if (!adminPassword) {
    console.error('Initialization failed: ADMIN_PASSWORD environment variable is required.');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const existingUser = await User.findOne({ username: adminUsername });
    if (existingUser) {
      console.log('Admin user already exists. Skipping creation.');
      await mongoose.connection.close();
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    let adminGroup = await Group.findOne({ name: 'admin' });
    if (!adminGroup) {
      adminGroup = await Group.create({
        name: 'admin',
        description: 'Administrator Group - Full System Access',
        members: [],
        permissions: [
          { resourceType: 'USER', target: '*', permission: 'ADMIN' },
          { resourceType: 'GROUP', target: '*', permission: 'ADMIN' },
          { resourceType: 'OBJECT', target: '*', permission: 'ADMIN' },
        ],
      });
      console.log('Admin group created with full permissions');
    }

    const adminUser = await User.create({
      username: adminUsername,
      email: adminEmail,
      password: hashedPassword,
      roleId: adminGroup._id,
      isVerified: true,
    });

    await Group.findByIdAndUpdate(adminGroup._id, {
      $addToSet: { members: adminUser._id },
    });

    console.log('Admin user created and linked to admin group');
    console.log(`Username: ${adminUsername}`);
    console.log('Use the configured ADMIN_PASSWORD to sign in.');

    await mongoose.connection.close();
  } catch (error) {
    console.error('Initialization failed:', error.message);
    process.exit(1);
  }
}

initializeAdmin();
