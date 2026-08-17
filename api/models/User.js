const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { trashFields, addPartialUniqueIndex } = require('../services/trash');

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    /** bcrypt hash; optional for Google-only accounts */
    password: {
      type: String,
      required: function requiredPassword() {
        return !this.googleId;
      },
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: 'Group',
      default: null,
    },
    /**
     * Login requires true. Self-register defaults false until email verification
     * or an admin sets isVerified. Google sign-in and admin create/bootstrap set true.
     */
    isVerified: { type: Boolean, default: false },
    /** Google subject id when the account is linked to Google. */
    googleId: { type: String, default: null },
    lastLoginAt: { type: Date, default: null },
    /** SHA-256 of the one-time reset token (raw token is only emailed). */
    resetTokenHash: { type: String, default: null },
    tokenExpiry: { type: Date, default: null },
    /** SHA-256 of the email verification token. */
    verificationTokenHash: { type: String, default: null },
    verificationTokenExpiry: { type: Date, default: null },
    ...trashFields,
  },
  { timestamps: true }
);

addPartialUniqueIndex(userSchema, 'username');
addPartialUniqueIndex(userSchema, 'email');
userSchema.index(
  { googleId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { deletedAt: null } }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
