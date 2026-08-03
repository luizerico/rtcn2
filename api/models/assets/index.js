/**
 * Register Asset discriminators. Import once before using subclass models.
 */
const mongoose = require('mongoose');
const { Asset } = require('../Asset');
const { ASSET_DISCRIMINATORS, ASSET_KINDS } = require('../../constants/assetTypes');
const Survey = require('./Survey');
const SurveyResponse = require('./SurveyResponse');

function emptyDiscriminator(name) {
  return mongoose.models[name] || Asset.discriminator(name, new mongoose.Schema({}));
}

const DocumentAsset = emptyDiscriminator(ASSET_DISCRIMINATORS.DOCUMENT);
const DashboardAsset = emptyDiscriminator(ASSET_DISCRIMINATORS.DASHBOARD);
const DatasetAsset = emptyDiscriminator(ASSET_DISCRIMINATORS.DATASET);

module.exports = {
  Asset,
  DocumentAsset,
  DashboardAsset,
  DatasetAsset,
  Survey,
  SurveyResponse,
  ASSET_KINDS,
  ASSET_DISCRIMINATORS,
};
