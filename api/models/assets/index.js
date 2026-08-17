/**
 * Concrete Asset subclasses — each has its own collection.
 * SurveyResponse is storage-only and is not part of the RBAC registry.
 */
const DocumentAsset = require('./Document');
const DashboardAsset = require('./Dashboard');
const DatasetAsset = require('./Dataset');
const Survey = require('./Survey');
const SurveyResponse = require('./SurveyResponse');
const Sponsor = require('./Sponsor');
const Opportunity = require('./Opportunity');
const Project = require('./Project');
const { ASSET_KINDS, ASSET_TYPE_LABELS, ASSET_DISCRIMINATORS } = require('../../constants/assetTypes');
const { activeFilter } = require('../../services/trash');

const KIND_MODELS = {
  DOCUMENT: DocumentAsset,
  DASHBOARD: DashboardAsset,
  DATASET: DatasetAsset,
  SURVEY: Survey,
  SPONSOR: Sponsor,
  OPPORTUNITY: Opportunity,
  PROJECT: Project,
};

function modelForKind(kind) {
  const key = String(kind || '').toUpperCase();
  return KIND_MODELS[key] || null;
}

/**
 * Find one asset by id across RBAC asset collections.
 */
async function findAssetById(id, { includeDeleted = false } = {}) {
  if (!id) return null;
  const filter = includeDeleted ? { _id: id } : activeFilter({ _id: id });
  const results = await Promise.all(
    Object.values(KIND_MODELS).map((Model) => Model.findOne(filter))
  );
  return results.find(Boolean) || null;
}

/**
 * Find assets across one or more kinds, merge, and optionally sort.
 * @param {object} filter Mongo filter applied to each collection
 * @param {{ kinds?: string[], sort?: Record<string, 1|-1>, populate?: Array<[string, string]> }} options
 */
async function findAssets(filter = {}, options = {}) {
  const kinds = (options.kinds || ASSET_KINDS).map((k) => String(k).toUpperCase());
  const models = kinds.map((k) => KIND_MODELS[k]).filter(Boolean);
  const queryFilter = options.includeDeleted ? filter : { ...activeFilter(), ...filter };

  let queries = models.map((Model) => {
    let q = Model.find(queryFilter);
    if (options.populate) {
      for (const [path, select] of options.populate) {
        q = q.populate(path, select);
      }
    }
    return q.lean();
  });

  const batches = await Promise.all(queries.map((q) => q.exec()));
  let rows = batches.flat();

  const sort = options.sort;
  if (sort && Object.keys(sort).length) {
    const [[field, dir]] = Object.entries(sort);
    const factor = dir === 1 || dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av > bv ? factor : -factor;
    });
  }

  return rows;
}

module.exports = {
  DocumentAsset,
  DashboardAsset,
  DatasetAsset,
  Survey,
  SurveyResponse,
  Sponsor,
  Opportunity,
  Project,
  ASSET_KINDS,
  ASSET_TYPE_LABELS,
  ASSET_DISCRIMINATORS,
  KIND_MODELS,
  modelForKind,
  findAssetById,
  findAssets,
};
