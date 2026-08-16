const mongoose = require('mongoose');
const Project = require('../models/assets/Project');
const { ASSET_TYPE_LABELS } = require('../constants/assetTypes');
const { sendError, ERROR_CODES } = require('../utils/httpErrors');
const { createDomainAssetHandlers, toPlain } = require('./domainAssetCrud');
const { parseProjectBody, loadRelatedEntities } = require('./fundingParse');

async function serializeProject(doc) {
  const plain = toPlain(doc);
  const relatedEntities = await loadRelatedEntities(plain.relatedEntity);
  return { ...plain, relatedEntities };
}

const handlers = createDomainAssetHandlers({
  Model: Project,
  kind: 'PROJECT',
  assetType: ASSET_TYPE_LABELS.PROJECT,
  noun: 'Project',
  searchFields: ['name', 'description', 'projWebsite', 'projStatus'],
  sortableFields: ['name', 'createdAt', 'updatedAt', 'projStartDate', 'projBudget', 'projStatus'],
  extraPopulate: [['opportunity', 'name sponsor type category']],
  parseBody: parseProjectBody,
  serialize: serializeProject,
});

exports.listProjects = async (req, res) => {
  const opportunity = String(req.query.opportunity || '').trim();
  if (opportunity) {
    if (!mongoose.isValidObjectId(opportunity)) {
      return sendError(res, 400, 'Invalid opportunity filter.', ERROR_CODES.VALIDATION);
    }
    req.extraListFilter = { ...(req.extraListFilter || {}), opportunity };
  }
  return handlers.list(req, res);
};
exports.createProject = handlers.create;
exports.getProjectById = handlers.getById;
exports.updateProject = handlers.update;
exports.deleteProject = handlers.remove;
