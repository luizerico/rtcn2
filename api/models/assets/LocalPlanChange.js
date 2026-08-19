const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { CHANGE_REASONS } = require('../../constants/localPlan');

const changeItemSchema = new Schema(
  {
    questionId: { type: String, required: true, trim: true },
    code: { type: String, default: '', trim: true },
    area: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const localPlanChangeSchema = new Schema(
  {
    localPlanId: {
      type: Schema.Types.ObjectId,
      ref: 'LocalPlan',
      required: true,
      index: true,
    },
    reason: { type: String, enum: CHANGE_REASONS, required: true },
    sourceRevision: { type: Number, default: null, min: 1 },
    added: { type: [changeItemSchema], default: [] },
    removed: { type: [changeItemSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false, collection: 'local_plan_changes' }
);

localPlanChangeSchema.index({ localPlanId: 1, createdAt: -1 });

module.exports =
  mongoose.models.LocalPlanChange || mongoose.model('LocalPlanChange', localPlanChangeSchema);
