const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { trashFields, addPartialUniqueIndex } = require('../services/trash');

const organizationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    website: { type: String, default: '', trim: true, maxlength: 2048 },
    email: { type: String, default: '', lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, default: '', trim: true, maxlength: 50 },
    ...trashFields,
  },
  { timestamps: true }
);

addPartialUniqueIndex(organizationSchema, 'name');

module.exports = mongoose.models.Organization || mongoose.model('Organization', organizationSchema);
