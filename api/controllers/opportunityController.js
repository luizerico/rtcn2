const mongoose = require('mongoose');
const Opportunity = require('../models/assets/Opportunity');
const { ASSET_TYPE_LABELS } = require('../constants/assetTypes');
const { sendError, ERROR_CODES } = require('../utils/httpErrors');
const { createDomainAssetHandlers, toPlain } = require('./domainAssetCrud');
const { parseOpportunityBody } = require('./fundingParse');

function serializeOpportunity(doc) {
  return toPlain(doc);
}

const handlers = createDomainAssetHandlers({
  Model: Opportunity,
  kind: 'OPPORTUNITY',
  assetType: ASSET_TYPE_LABELS.OPPORTUNITY,
  noun: 'Opportunity',
  searchFields: ['name', 'description', 'website', 'submissionMethod'],
  sortableFields: ['name', 'createdAt', 'updatedAt', 'startDate', 'budget'],
  extraPopulate: [['sponsor', 'name orgEmail origem']],
  parseBody: parseOpportunityBody,
  serialize: serializeOpportunity,
});

exports.listOpportunities = async (req, res) => {
  const sponsor = String(req.query.sponsor || '').trim();
  if (sponsor) {
    if (!mongoose.isValidObjectId(sponsor)) {
      return sendError(res, 400, 'Invalid sponsor filter.', ERROR_CODES.VALIDATION);
    }
    req.extraListFilter = { ...(req.extraListFilter || {}), sponsor };
  }
  return handlers.list(req, res);
};
exports.createOpportunity = handlers.create;
exports.getOpportunityById = handlers.getById;
exports.updateOpportunity = handlers.update;
exports.deleteOpportunity = handlers.remove;
