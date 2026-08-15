const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const regionSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: 'regions' }
);

regionSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.models.Region || mongoose.model('Region', regionSchema);
