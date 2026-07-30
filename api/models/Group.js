const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const permissionSchema = new Schema({
    resourceType: {
        type: String,
        enum: ['USER', 'GROUP', 'OBJECT'],
        required: true,
    },
    // Optional concrete resource id; omit for type-wide policies
    resourceId: {
        type: Schema.Types.ObjectId,
        required: false,
        default: null,
    },
    // Human-readable target label used by policy management UI (e.g. "User")
    target: {
        type: String,
        required: true,
        trim: true,
    },
    permission: {
        type: String,
        enum: ['READ', 'WRITE', 'DELETE', 'ADMIN'],
        required: true,
    },
}, { _id: false });

const groupSchema = new Schema({
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    members: [{
        type: Schema.Types.ObjectId,
        ref: 'User',
    }],
    permissions: [permissionSchema],
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);
