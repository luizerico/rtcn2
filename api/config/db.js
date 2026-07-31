const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { resolveMongoUri } = require('./mongoUri');

dotenv.config();

const connectDB = async () => {
  try {
    const mongoUri = resolveMongoUri();
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully.');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    if (/auth/i.test(err.message)) {
      console.error(
        'Hint: If you use Docker Mongo, set MONGO_URI with credentials or MONGO_ROOT_USER/MONGO_ROOT_PASS.'
      );
      console.error(
        'Example: mongodb://root:rootpassword@localhost:27178/projects?authSource=admin'
      );
    }
    process.exit(1);
  }
};

module.exports = connectDB;
