const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const biomeSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: 'biomes' }
);

biomeSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.models.Biome || mongoose.model('Biome', biomeSchema);
