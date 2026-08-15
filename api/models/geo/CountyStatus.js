const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const yearlyValueSchema = new Schema(
  {
    value: { type: Number },
    year: { type: Number },
  },
  { _id: false }
);

const endangeredPeopleSchema = new Schema(
  {
    value: { type: Number },
    riskType: { type: String, trim: true },
    year: { type: Number },
  },
  { _id: false }
);

const countyStatusSchema = new Schema(
  {
    county: { type: Schema.Types.ObjectId, ref: 'County', required: true, unique: true },
    endangeredPeople: { type: [endangeredPeopleSchema], default: [] },
    disasterRate: { type: [yearlyValueSchema], default: [] },
    hidroRisk: { type: [yearlyValueSchema], default: [] },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: 'county_status' }
);

module.exports = mongoose.models.CountyStatus || mongoose.model('CountyStatus', countyStatusSchema);
