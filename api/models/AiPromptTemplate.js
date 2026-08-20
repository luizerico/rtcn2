const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { PROMPT_KEYS, PROMPT_MAX } = require('../constants/opportunityMatch');

const KEYS = Object.values(PROMPT_KEYS);

const aiPromptTemplateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, enum: KEYS, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 128 },
    body: { type: String, required: true, maxlength: PROMPT_MAX },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'ai_prompt_templates' }
);

module.exports =
  mongoose.models.AiPromptTemplate || mongoose.model('AiPromptTemplate', aiPromptTemplateSchema);
