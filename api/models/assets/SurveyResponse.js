const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { Asset } = require('../Asset');
const { ASSET_DISCRIMINATORS } = require('../../constants/assetTypes');

/**
 * Survey response asset subclass (answers to a Survey).
 */
const answerSchema = new Schema(
  {
    questionId: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

const surveyResponseSchema = new Schema({
  surveyId: {
    type: Schema.Types.ObjectId,
    ref: 'Asset',
    required: true,
    index: true,
  },
  answers: {
    type: [answerSchema],
    default: [],
    validate: {
      validator(value) {
        return Array.isArray(value) && value.length > 0;
      },
      message: 'A survey response must include at least one answer.',
    },
  },
});

const SurveyResponse =
  mongoose.models[ASSET_DISCRIMINATORS.SURVEY_RESPONSE] ||
  Asset.discriminator(ASSET_DISCRIMINATORS.SURVEY_RESPONSE, surveyResponseSchema);

module.exports = SurveyResponse;
