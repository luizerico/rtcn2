const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Audit trail of user actions against the API.
 * Never store passwords, JWTs, or reset tokens in `meta`.
 */
const actionLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    username: {
      type: String,
      default: '',
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      required: true,
      index: true,
    },
    resourceId: {
      type: String,
      default: null,
      index: true,
    },
    method: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },
    path: {
      type: String,
      required: true,
    },
    statusCode: {
      type: Number,
      required: true,
      index: true,
    },
    success: {
      type: Boolean,
      required: true,
      index: true,
    },
    message: {
      type: String,
      default: '',
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    clientApp: {
      type: String,
      default: 'rbac-platform',
      index: true,
    },
    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

actionLogSchema.index({ createdAt: -1 });
actionLogSchema.index({ username: 1, createdAt: -1 });
actionLogSchema.index({ action: 1, createdAt: -1 });
actionLogSchema.index({ resourceType: 1, createdAt: -1 });
actionLogSchema.index({
  username: 'text',
  action: 'text',
  resourceType: 'text',
  path: 'text',
  message: 'text',
});

module.exports = mongoose.model('ActionLog', actionLogSchema);
