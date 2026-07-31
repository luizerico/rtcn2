const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Persistent auth sessions for JWT validation and cross-app shared authentication.
 * Other apps sharing this MongoDB can trust active (non-revoked, non-expired) sessions.
 */
const sessionSchema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      default: '',
    },
    ipAddress: {
      type: String,
      default: '',
    },
    clientApp: {
      type: String,
      default: 'rbac-platform',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
    revokeReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

sessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

module.exports = mongoose.model('Session', sessionSchema);
