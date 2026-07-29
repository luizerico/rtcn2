const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/rbac_app";
        await mongoose.connect(mongoUri);
        console.log("✅ MongoDB connected successfully.");
    } catch (err) {
        console.error("❌ MongoDB connection failed:", err.message);
        process.exit(1); // Exit the process with failure
    }
};

module.exports = connectDB;