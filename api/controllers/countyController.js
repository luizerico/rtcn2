const mongoose = require('mongoose');
const { County, CountyStatus, CountyEmission } = require('../models/geo');
const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');
const {
  parseListQuery,
  clampPage,
  paginatedResponse,
  textSearchOr,
  escapeRegex,
} = require('../utils/listQuery');
const { objectId, ValidationError } = require('../validation');

const COUNTY_SORT_FIELDS = new Set(['name', 'code', 'IBGECode', 'population']);
const EMISSION_SORT_FIELDS = new Set([
  'year',
  'value',
  'sector',
  'category',
  'subCategory',
  'product',
  'activity',
  'actionType',
  'gasType',
  'detail',
]);
const POPULATE = [
  { path: 'region', select: 'code name' },
  { path: 'state', select: 'code name' },
  { path: 'microregion', select: 'code name' },
  { path: 'biome', select: 'code name' },
];

function optionalObjectId(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  return objectId(value, label);
}

function notDeletedFilter() {
  return { isDeleted: { $ne: true } };
}

exports.listCounties = async (req, res) => {
  try {
    const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
      { ...req.query, order: req.query.order || 'asc' },
      COUNTY_SORT_FIELDS,
      'name'
    );

    const filter = notDeletedFilter();
    const qOr = textSearchOr(['name', 'code', 'IBGECode'], req.query.q);
    if (qOr) filter.$or = qOr;

    const regionId = optionalObjectId(req.query.regionId, 'regionId');
    const stateId = optionalObjectId(req.query.stateId, 'stateId');
    const microregionId = optionalObjectId(req.query.microregionId, 'microregionId');
    const biomeId = optionalObjectId(req.query.biomeId, 'biomeId');
    if (regionId) filter.region = regionId;
    if (stateId) filter.state = stateId;
    if (microregionId) filter.microregion = microregionId;
    if (biomeId) filter.biome = biomeId;

    const total = await County.countDocuments(filter);
    const { page, skip } = clampPage(rawPage, total, limit);

    const items = await County.find(filter)
      .populate(POPULATE)
      .sort({ [sortField]: sortOrder, _id: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

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
    return sendServerError(res, error, 'Error fetching counties');
  }
};

exports.getCountyById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, 'Invalid County id.', ERROR_CODES.VALIDATION);
    }

    const county = await County.findOne({ _id: req.params.id, ...notDeletedFilter() })
      .populate(POPULATE)
      .lean();
    if (!county) {
      return sendError(res, 404, 'County not found.', ERROR_CODES.NOT_FOUND);
    }

    const status = await CountyStatus.findOne({
      county: county._id,
      isDeleted: { $ne: true },
    }).lean();

    return res.status(200).json({
      ...county,
      status: status
        ? {
            endangeredPeople: status.endangeredPeople || [],
            disasterRate: status.disasterRate || [],
            hidroRisk: status.hidroRisk || [],
          }
        : { endangeredPeople: [], disasterRate: [], hidroRisk: [] },
    });
  } catch (error) {
    return sendServerError(res, error, 'Error fetching county');
  }
};

exports.listCountyEmissions = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, 'Invalid County id.', ERROR_CODES.VALIDATION);
    }

    const county = await County.findOne({ _id: req.params.id, ...notDeletedFilter() }).select('_id');
    if (!county) {
      return sendError(res, 404, 'County not found.', ERROR_CODES.NOT_FOUND);
    }

    const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
      { ...req.query, order: req.query.order || 'desc' },
      EMISSION_SORT_FIELDS,
      'year'
    );

    const filter = { county: county._id };
    if (req.query.year) {
      const year = Number(req.query.year);
      if (!Number.isFinite(year)) {
        return sendError(res, 400, 'Invalid year.', ERROR_CODES.VALIDATION);
      }
      filter.year = year;
    }
    if (req.query.sector) {
      filter.sector = { $regex: escapeRegex(String(req.query.sector).trim()), $options: 'i' };
    }
    const qOr = textSearchOr(['sector', 'category', 'subCategory', 'product', 'activity'], req.query.q);
    if (qOr) filter.$or = qOr;

    const total = await CountyEmission.countDocuments(filter);
    const { page, skip } = clampPage(rawPage, total, limit);
    const items = await CountyEmission.find(filter)
      .sort({ [sortField]: sortOrder, _id: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

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
    return sendServerError(res, error, 'Error fetching county emissions');
  }
};
