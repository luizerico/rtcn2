const mongoose = require('mongoose');
const { GeoIndicator, GeoDisaster, GeoAmendment } = require('../models/geo');
const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');
const { parseListQuery, clampPage, paginatedResponse } = require('../utils/listQuery');
const { objectId, ValidationError } = require('../validation');

const INDICATOR_SORT = new Set(['year', 'series', 'source', 'value']);
const DISASTER_SORT = new Set(['occurredAt', 'cobrade', 'recognition']);
const AMENDMENT_SORT = new Set([
  'year',
  'author',
  'amendmentType',
  'function',
  'subfunction',
  'grupo',
  'purpose',
  'action',
  'committed',
  'paid',
  'code',
  'target',
]);
const KINDS = new Set(['county', 'state', 'region']);

function optionalObjectId(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return objectId(value, label);
}

async function listIndicators(req, res) {
  try {
    const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
      { ...req.query, order: req.query.order || 'desc' },
      INDICATOR_SORT,
      'year',
      { maxLimit: 500, defaultLimit: 100 }
    );
    const kind = String(req.query.kind || '').trim().toLowerCase();
    if (kind && !KINDS.has(kind)) {
      return sendError(res, 400, 'kind must be county, state, or region.', ERROR_CODES.VALIDATION);
    }

    const filter = {};
    if (kind) filter.kind = kind;
    const id = optionalObjectId(req.query.id, 'id');
    if (id) filter.subjectId = id;
    if (req.query.source) filter.source = String(req.query.source).trim();
    if (req.query.series) filter.series = String(req.query.series).trim();
    const year = req.query.year != null && req.query.year !== '' ? Number(req.query.year) : null;
    if (year != null) {
      if (!Number.isInteger(year)) {
        return sendError(res, 400, 'year must be an integer.', ERROR_CODES.VALIDATION);
      }
      filter.year = year;
    }

    const total = await GeoIndicator.countDocuments(filter);
    const { page, skip } = clampPage(rawPage, total, limit);
    const items = await GeoIndicator.find(filter)
      .sort({ [sortField]: sortOrder, _id: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json(paginatedResponse({ items, total, page, limit, sortField, orderLabel }));
  } catch (error) {
    if (error instanceof ValidationError || error instanceof mongoose.Error.CastError) {
      return sendError(res, 400, error.message || 'Invalid query.', ERROR_CODES.VALIDATION);
    }
    return sendServerError(res, error, 'Error listing geography indicators');
  }
}

async function listDisasters(req, res) {
  try {
    const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
      { ...req.query, order: req.query.order || 'desc' },
      DISASTER_SORT,
      'occurredAt'
    );
    const filter = {};
    const countyId = optionalObjectId(req.query.countyId, 'countyId');
    if (countyId) filter.county = countyId;
    if (req.query.ibgeId) filter.ibgeId = String(req.query.ibgeId).replace(/\D/g, '');
    if (req.query.from) {
      const from = new Date(req.query.from);
      if (Number.isNaN(from.getTime())) {
        return sendError(res, 400, 'from must be a valid date.', ERROR_CODES.VALIDATION);
      }
      filter.occurredAt = { ...(filter.occurredAt || {}), $gte: from };
    }
    if (req.query.to) {
      const to = new Date(req.query.to);
      if (Number.isNaN(to.getTime())) {
        return sendError(res, 400, 'to must be a valid date.', ERROR_CODES.VALIDATION);
      }
      filter.occurredAt = { ...(filter.occurredAt || {}), $lte: to };
    }

    const total = await GeoDisaster.countDocuments(filter);
    const { page, skip } = clampPage(rawPage, total, limit);
    const items = await GeoDisaster.find(filter)
      .sort({ [sortField]: sortOrder, _id: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json(paginatedResponse({ items, total, page, limit, sortField, orderLabel }));
  } catch (error) {
    if (error instanceof ValidationError || error instanceof mongoose.Error.CastError) {
      return sendError(res, 400, error.message || 'Invalid query.', ERROR_CODES.VALIDATION);
    }
    return sendServerError(res, error, 'Error listing geography disasters');
  }
}

async function listAmendments(req, res) {
  try {
    const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
      { ...req.query, order: req.query.order || 'desc' },
      AMENDMENT_SORT,
      'year',
      { maxLimit: 500, defaultLimit: 100 }
    );
    const kind = String(req.query.kind || '').trim().toLowerCase();
    if (kind && !KINDS.has(kind)) {
      return sendError(res, 400, 'kind must be county, state, or region.', ERROR_CODES.VALIDATION);
    }

    const filter = {};
    const id = optionalObjectId(req.query.id, 'id');
    if (kind === 'county' && id) {
      filter.$or = [{ subjectId: id }, { county: id }];
    } else if (kind === 'state' && id) {
      filter.state = id;
    } else if (kind === 'region' && id) {
      filter.region = id;
    } else if (id) {
      filter.subjectId = id;
    }
    if (req.query.ibgeId) filter.ibgeId = String(req.query.ibgeId).replace(/\D/g, '');
    if (req.query.amendmentType) filter.amendmentType = String(req.query.amendmentType).trim();
    const year = req.query.year != null && req.query.year !== '' ? Number(req.query.year) : null;
    if (year != null) {
      if (!Number.isInteger(year)) {
        return sendError(res, 400, 'year must be an integer.', ERROR_CODES.VALIDATION);
      }
      filter.year = year;
    }

    const total = await GeoAmendment.countDocuments(filter);
    const { page, skip } = clampPage(rawPage, total, limit);
    const items = (await GeoAmendment.find(filter)
      .sort({ [sortField]: sortOrder, _id: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean()).map((row) => ({
      ...row,
      function: row.function || row.functionName || '',
      subfunction: row.subfunction || row.subfunctionName || '',
      grupo: row.grupo || row.expenseGroup || '',
      action: row.action || row.actionName || '',
    }));

    return res.status(200).json(paginatedResponse({ items, total, page, limit, sortField, orderLabel }));
  } catch (error) {
    if (error instanceof ValidationError || error instanceof mongoose.Error.CastError) {
      return sendError(res, 400, error.message || 'Invalid query.', ERROR_CODES.VALIDATION);
    }
    return sendServerError(res, error, 'Error listing geography amendments');
  }
}

module.exports = {
  listIndicators,
  listDisasters,
  listAmendments,
};
