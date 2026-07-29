const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// --- 3. Object Model (Protected Resource) ---
const objectSchema = new Schema({
    name: { type: String, required: true },
    ownerId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', // The user who created/owns the resource
        required: true 
    },
    resourceType: { 
        type: String, 
        enum: ['DOCUMENT', 'DASHBOARD', 'DATASET'], // Example types of protected objects
        default: 'DOCUMENT' 
    },
    description: { type: String, default: "" },
    // We could optionally add a simple access control list (ACL) array here for quick reads, 
    // but we will enforce the main RBAC via Group/User permissions.
}, { timestamps: true });

module.exports = mongoose.model('Object', objectSchema);