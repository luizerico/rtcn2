const mongoose = require('mongoose');
const { Region, State, MicroRegion, Biome } = require('../models/geo');
const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');
const { parseListQuery, clampPage, paginatedResponse, textSearchOr } = require('../utils/listQuery');
const { objectId, ValidationError } = require('../validation');

const GEO_SORT_FIELDS = new Set(['code', 'name']);
const POPULATE_REGION = { path: 'region', select: 'code name' };
const POPULATE_STATE = { path: 'state', select: 'code name' };

function optionalObjectId(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  return objectId(value, label);
}

function notDeletedFilter() {
  return { isDeleted: { $ne: true } };
}

function createListHandler({ Model, extraFilters = [] }) {
  return async (req, res) => {
    try {
      const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
        { ...req.query, order: req.query.order || 'asc' },
        GEO_SORT_FIELDS,
        'name'
      );

      const filter = notDeletedFilter();
      const qOr = textSearchOr(['code', 'name'], req.query.q);
      if (qOr) filter.$or = qOr;

      if (extraFilters.includes('regionId')) {
        const regionId = optionalObjectId(req.query.regionId, 'regionId');
        if (regionId) filter.region = regionId;
      }
      if (extraFilters.includes('stateId')) {
        const stateId = optionalObjectId(req.query.stateId, 'stateId');
        if (stateId) filter.state = stateId;
      }

      const total = await Model.countDocuments(filter);
      const { page, skip } = clampPage(rawPage, total, limit);

      let query = Model.find(filter)
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .skip(skip)
        .limit(limit);

      if (Model.schema.path('region')) {
        query = query.populate(POPULATE_REGION);
      }
      if (Model.schema.path('state')) {
        query = query.populate(POPULATE_STATE);
      }

      const items = await query.lean();

      return res.status(200).json(
        paginatedResponse({
          items,
          total,
          page,
          limit,
          sortField,
          orderLabel,
        })
      );
    } catch (error) {
      if (error instanceof ValidationError || error?.statusCode === 400) {
        return sendError(res, 400, error.message, ERROR_CODES.VALIDATION);
      }
      return sendServerError(res, error, 'Error fetching geography catalog');
    }
  };
}

function createGetByIdHandler({ Model, label }) {
  return async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return sendError(res, 400, `Invalid ${label} id.`, ERROR_CODES.VALIDATION);
      }

      let query = Model.findOne({ _id: req.params.id, ...notDeletedFilter() });
      if (Model.schema.path('region')) {
        query = query.populate(POPULATE_REGION);
      }
      if (Model.schema.path('state')) {
        query = query.populate(POPULATE_STATE);
      }

      const doc = await query.lean();
      if (!doc) {
        return sendError(res, 404, `${label} not found.`, ERROR_CODES.NOT_FOUND);
      }
      return res.status(200).json(doc);
    } catch (error) {
      return sendServerError(res, error, `Error fetching ${label.toLowerCase()}`);
    }
  };
}

const listRegions = createListHandler({ Model: Region });
const getRegionById = createGetByIdHandler({ Model: Region, label: 'Region' });

const listStates = createListHandler({ Model: State, extraFilters: ['regionId'] });
const getStateById = createGetByIdHandler({ Model: State, label: 'State' });

const listMicroregions = createListHandler({
  Model: MicroRegion,
  extraFilters: ['regionId', 'stateId'],
});
const getMicroregionById = createGetByIdHandler({ Model: MicroRegion, label: 'Microregion' });

const listBiomes = createListHandler({ Model: Biome });
const getBiomeById = createGetByIdHandler({ Model: Biome, label: 'Biome' });

module.exports = {
  listRegions,
  getRegionById,
  listStates,
  getStateById,
  listMicroregions,
  getMicroregionById,
  listBiomes,
  getBiomeById,
};
