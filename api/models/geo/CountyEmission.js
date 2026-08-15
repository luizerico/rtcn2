const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const countyEmissionSchema = new Schema(
  {
    county: { type: Schema.Types.ObjectId, ref: 'County', required: true, index: true },
    actionType: { type: String, trim: true },
    gasType: { type: String, trim: true },
    value: { type: Number },
    year: { type: Number },
    sector: { type: String, trim: true },
    category: { type: String, trim: true },
    subCategory: { type: String, trim: true },
    product: { type: String, trim: true },
    detail: { type: String, trim: true },
    activity: { type: String, trim: true },
  },
  { timestamps: true, collection: 'county_emissions' }
);

countyEmissionSchema.index({ county: 1, year: 1 });
countyEmissionSchema.index({ county: 1, sector: 1 });

module.exports =
  mongoose.models.CountyEmission || mongoose.model('CountyEmission', countyEmissionSchema);
