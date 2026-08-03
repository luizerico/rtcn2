const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { Asset } = require('../Asset');
const { ASSET_DISCRIMINATORS } = require('../../constants/assetTypes');

/**
 * Survey asset subclass. Questions are stored in the separate Question collection
 * (not embedded and not an Asset subclass).
 */
const surveySchema = new Schema({
  questionCount: { type: Number, default: 0, min: 0 },
});

const Survey =
  mongoose.models[ASSET_DISCRIMINATORS.SURVEY] ||
  Asset.discriminator(ASSET_DISCRIMINATORS.SURVEY, surveySchema);

module.exports = Survey;
