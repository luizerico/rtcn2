const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { createAssetSchema, registerAssetModel } = require('../Asset');
const { QUESTION_TYPES, ASSET_TYPE_LABELS } = require('../../constants/assetTypes');

const questionSubSchema = new Schema(
  {
    questionId: { type: String, required: true },
    prompt: { type: String, required: true, trim: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

/**
 * Survey asset — own collection. Questions are embedded (not a separate model).
 */
const surveySchema = createAssetSchema(
  {
    questions: {
      type: [questionSubSchema],
      default: [],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: 'A survey must include at least one question.',
      },
    },
  },
  {
    collection: 'surveys',
    assetType: ASSET_TYPE_LABELS.SURVEY,
    kind: 'SURVEY',
  }
);

const Survey = registerAssetModel('Survey', surveySchema);

module.exports = Survey;
