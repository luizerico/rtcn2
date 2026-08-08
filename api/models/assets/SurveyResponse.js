const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Survey response — storage only (not an RBAC permission resource).
 * Uses shared audit/identity fields but is not registered as an Asset kind.
 */
const answerSchema = new Schema(
  {
    questionId: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

const surveyResponseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    /** Storage label only — not an RBAC permission resource type. */
    kind: { type: String, required: true, default: 'SURVEY_RESPONSE' },
    assetType: { type: String, required: true, default: 'SurveyResponse' },
    surveyId: {
      type: Schema.Types.ObjectId,
      ref: 'Survey',
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
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'survey_responses',
  }
);

surveyResponseSchema.index({ surveyId: 1, createdAt: -1 });

const SurveyResponse =
  mongoose.models.SurveyResponse || mongoose.model('SurveyResponse', surveyResponseSchema);

module.exports = SurveyResponse;
