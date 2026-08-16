const Sponsor = require('../models/assets/Sponsor');
const { ASSET_TYPE_LABELS } = require('../constants/assetTypes');
const { createDomainAssetHandlers, toPlain } = require('./domainAssetCrud');
const { parseSponsorBody } = require('./fundingParse');

const handlers = createDomainAssetHandlers({
  Model: Sponsor,
  kind: 'SPONSOR',
  assetType: ASSET_TYPE_LABELS.SPONSOR,
  noun: 'Sponsor',
  searchFields: ['name', 'description', 'orgEmail', 'contact', 'city'],
  sortableFields: ['name', 'createdAt', 'updatedAt', 'origem'],
  parseBody: parseSponsorBody,
  serialize: (doc) => toPlain(doc),
});

exports.listSponsors = handlers.list;
exports.createSponsor = handlers.create;
exports.getSponsorById = handlers.getById;
exports.updateSponsor = handlers.update;
exports.deleteSponsor = handlers.remove;
