const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { trashFields, addPartialUniqueIndex } = require('../services/trash');

const groupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    ...trashFields,
  },
  { timestamps: true }
);

addPartialUniqueIndex(groupSchema, 'name');

module.exports = mongoose.models.Group || mongoose.model('Group', groupSchema);
