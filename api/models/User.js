const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { trashFields, addPartialUniqueIndex } = require('../services/trash');

const GOOGLE_ID_INDEX_NAME = 'googleId_1';
const GOOGLE_ID_PARTIAL_FILTER = {
  googleId: { $type: 'string' },
  deletedAt: null,
};

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
    /**
     * Admin kill-switch. Login and session use require true.
     * Defaults true so existing accounts keep working.
     */
    isEnabled: { type: Boolean, default: true },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
    },
    language: { type: String, default: null, trim: true, maxlength: 10 },
    /** Google subject id when the account is linked to Google. Omitted for password users. */
    googleId: { type: String },
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
userSchema.index({ organization: 1 });
userSchema.index(
  { googleId: 1 },
  {
    unique: true,
    name: GOOGLE_ID_INDEX_NAME,
    partialFilterExpression: GOOGLE_ID_PARTIAL_FILTER,
  }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

function googleIdUniqueIndexIncludesNulls(index) {
  if (!index?.unique) return false;
  const key = index.key || {};
  if (Object.keys(key).length !== 1 || key.googleId !== 1) return false;
  const googleFilter = index.partialFilterExpression?.googleId;
  const type = googleFilter?.$type;
  return type !== 'string' && type !== 2;
}

/**
 * Drop unique googleId indexes that treat `null` as a value (only one local user
 * can exist). Recreate a partial unique index on real Google subject ids.
 */
async function migrateUserGoogleIdIndex() {
  await User.collection.updateMany(
    { $or: [{ googleId: null }, { googleId: '' }] },
    { $unset: { googleId: '' } }
  );

  try {
    const indexes = await User.collection.indexes();
    for (const index of indexes) {
      if (!index.name || index.name === '_id_') continue;
      if (googleIdUniqueIndexIncludesNulls(index)) {
        await User.collection.dropIndex(index.name);
      }
    }
    await User.syncIndexes();
  } catch (error) {
    console.warn('User googleId index migration skipped:', error.message);
  }
}

User.migrateUserGoogleIdIndex = migrateUserGoogleIdIndex;

module.exports = User;
