const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { QUESTION_TYPES } = require('../constants/assetTypes');

/**
 * Survey questions live in their own collection — not Asset subclasses.
 */
const questionSchema = new Schema(
  {
    surveyId: {
      type: Schema.Types.ObjectId,
      ref: 'Asset',
      required: true,
      index: true,
    },
    questionId: {
      type: String,
      required: true,
      index: true,
    },
    prompt: { type: String, required: true, trim: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'questions',
  }
);

questionSchema.index({ surveyId: 1, questionId: 1 }, { unique: true });
questionSchema.index({ surveyId: 1, sortOrder: 1 });

module.exports = mongoose.models.Question || mongoose.model('Question', questionSchema);
