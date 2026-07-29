"import mongoose from 'mongoose';

/**
 * Connects the application to MongoDB using the URI from environment variables.
 * This function should be called once at the start of the application lifecycle.
 */
const connectDB = async () => {
  // In a real Next.js app, process.env will be available in API routes/server components.
  // We read the connection string assuming it has been set up via dotenv or environment variables.
  if (!process.env.MONGO_URI) {
    throw new Error(\"FATAL ERROR: MONGO_URI is not defined in environment variables.\");
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connection successful.');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    // Exit process on failure in a production deployment setup
    process.exit(1);
  }
};

export default connectDB;
"