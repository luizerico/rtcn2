const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { RESOURCE_TYPES, ACTIONS, PRINCIPAL_TYPES } = require('../constants/rbac');

/**
 * ACL-style grant: one action for a USER or GROUP principal on an Asset subclass
 * (target='*', resourceId=null) or one concrete asset (resourceId set).
 * USER and GROUP are never resourceType values — they are principals only.
 */
const permissionSchema = new Schema(
  {
    principalType: {
      type: String,
      enum: PRINCIPAL_TYPES,
      required: true,
      index: true,
    },
    principalId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    /** @deprecated Prefer principalType=GROUP + principalId. Kept for migration/compat. */
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'Group',
      required: false,
      default: undefined,
      index: true,
      sparse: true,
    },
    resourceType: {
      type: String,
      enum: RESOURCE_TYPES,
      required: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: false,
      default: null,
      index: true,
    },
    target: {
      type: String,
      required: true,
      trim: true,
    },
    permission: {
      type: String,
      enum: ACTIONS,
      required: true,
    },
  },
  { timestamps: true }
);

permissionSchema.index(
  { principalType: 1, principalId: 1, resourceType: 1, resourceId: 1, permission: 1 },
  { unique: true }
);

module.exports = mongoose.model('Permission', permissionSchema);
