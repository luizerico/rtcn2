const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const QUESTION_TYPES = ['text', 'multiple_choice', 'yes_no'];
const ASSET_KINDS = ['DOCUMENT', 'DASHBOARD', 'DATASET', 'SURVEY', 'SURVEY_RESPONSE'];

/**
 * Base Asset (formerly Object). Stored in the `assets` collection.
 * Survey and SurveyResponse are Mongoose discriminators (subclasses).
 */
const assetSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    description: { type: String, default: '' },
    kind: {
      type: String,
      enum: ASSET_KINDS,
      default: 'DOCUMENT',
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
    discriminatorKey: 'assetType',
    collection: 'assets',
  }
);

assetSchema.index({ assetType: 1, createdAt: -1 });

const Asset = mongoose.models.Asset || mongoose.model('Asset', assetSchema);

const questionSchema = new Schema(
  {
    questionId: { type: String, required: true },
    prompt: { type: String, required: true, trim: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: true },
  },
  { _id: false }
);

const Survey =
  mongoose.models.Survey ||
  Asset.discriminator(
    'Survey',
    new Schema({
      questions: {
        type: [questionSchema],
        default: [],
        validate: {
          validator(value) {
            return Array.isArray(value) && value.length > 0;
          },
          message: 'A survey must include at least one question.',
        },
      },
    })
  );

const answerSchema = new Schema(
  {
    questionId: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

const SurveyResponse =
  mongoose.models.SurveyResponse ||
  Asset.discriminator(
    'SurveyResponse',
    new Schema({
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
    })
  );

module.exports = {
  Asset,
  Survey,
  SurveyResponse,
  QUESTION_TYPES,
  ASSET_KINDS,
};
