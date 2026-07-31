const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { RESOURCE_TYPES, ACTIONS } = require('../constants/rbac');

/**
 * Standalone permissions collection.
 * Each row grants one action on a resource type/target to a group.
 */
const permissionSchema = new Schema(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
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
  { groupId: 1, resourceType: 1, target: 1, permission: 1 },
  { unique: true }
);

module.exports = mongoose.model('Permission', permissionSchema);
