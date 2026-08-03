const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// --- 1. User Model ---
const userSchema = new Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Stored as bcrypt hash
    roleId: { 
        type: Schema.Types.ObjectId, 
        ref: 'Group', // Assuming a default role group exists
        default: null 
    },
    // Login/session require true. Self-register defaults false until an admin
    // verifies; admin create and bootstrap set true. No email-verification flow yet.
    isVerified: { type: Boolean, default: false },
    resetToken: { type: String, default: null },
    tokenExpiry: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);