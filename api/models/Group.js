const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// --- 2. Group Model ---
const groupSchema = new Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    // Users belonging to this group (for easy membership lookup)
    members: [{
        type: Schema.Types.ObjectId, 
        ref: 'User'
    }],
    // This holds the actual permissions granted *to* the group. 
    // We will use an array of embedded permission objects for simplicity now.
    permissions: [{
        resourceType: { type: String, enum: ['USER', 'GROUP', 'OBJECT'], required: true },
        resourceId: { type: Schema.Types.ObjectId, required: true }, // ID of the object/user being protected
        permission: { 
            type: String, 
            enum: ['READ', 'WRITE', 'DELETE', 'ADMIN'], 
            required: true 
        }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);