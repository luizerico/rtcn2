const mongoose = require('mongoose');
const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');
const { activeFilter, applyTrash } = require('../services/trash');

const USER_POPULATE = [
  ['ownerId', 'username email'],
  ['createdBy', 'username email'],
  ['updatedBy', 'username email'],
];

function toPlain(doc) {
  if (!doc) return doc;
  return typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
}

function applyAccessFilter(filter, access) {
  if (!access || access.all) return { empty: false };
  if (!access.ids.length) return { empty: true };
  filter._id = { $in: access.ids };
  return { empty: false };
}

function parseListQuery(query = {}, sortableFields, defaultSort = 'updatedAt') {
  const allowed = sortableFields instanceof Set ? sortableFields : new Set(sortableFields);
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
  const limitRaw = parseInt(String(query.limit || '10'), 10) || 10;
  const limit = Math.min(100, Math.max(1, limitRaw));
  const search = String(query.search || query.q || '').trim();
  const sortField = allowed.has(String(query.sort || '')) ? String(query.sort) : defaultSort;
  const order = String(query.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const createdBy = String(query.createdBy || '').trim();
  return { page, limit, search, sortField, order, createdBy };
}

function applyPopulate(query, extraPopulate = []) {
  let next = query;
  for (const [path, select] of USER_POPULATE) {
    next = next.populate(path, select);
  }
  for (const item of extraPopulate) {
    if (typeof item === 'string') {
      next = next.populate(item);
    } else if (Array.isArray(item)) {
      next = next.populate(item[0], item[1]);
    } else if (item && item.path) {
      next = next.populate(item);
    }
  }
  return next;
}

function handleControllerError(res, error, message) {
  if (error instanceof ValidationError || error?.statusCode === 400 || error?.name === 'ValidationError') {
    const text = error.message || 'Invalid request.';
    return sendError(res, 400, text, ERROR_CODES.VALIDATION);
  }
  return sendServerError(res, error, message);
}

/**
 * Shared list/get/create/update/delete handlers for domain asset kinds.
 */
function createDomainAssetHandlers({
  Model,
  kind,
  assetType,
  noun,
  searchFields = ['name', 'description'],
  sortableFields = ['name', 'createdAt', 'updatedAt'],
  extraPopulate = [],
  parseBody,
  serialize = toPlain,
}) {
  const notFound = `${noun} not found.`;

  async function list(req, res) {
    try {
      const { page, limit, search, sortField, order, createdBy } = parseListQuery(
        req.query,
        sortableFields
      );
      const filter = activeFilter();
      const access = req.accessibleResources;
      if (applyAccessFilter(filter, access).empty) {
        return res.status(200).json({
          items: [],
          page,
          limit,
          total: 0,
          totalPages: 0,
          sort: sortField,
          order,
          search,
          filters: { createdBy: createdBy || null },
        });
      }

      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = searchFields.map((field) => ({
          [field]: { $regex: escaped, $options: 'i' },
        }));
      }

      if (createdBy) {
        if (!mongoose.isValidObjectId(createdBy)) {
          return sendError(res, 400, 'Invalid createdBy filter.', ERROR_CODES.VALIDATION);
        }
        filter.createdBy = createdBy;
      }

      const extra = req.extraListFilter;
      if (extra && typeof extra === 'object') {
        Object.assign(filter, extra);
      }

      const total = await Model.countDocuments(filter);
      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
      const skip = (page - 1) * limit;

      const docs = await applyPopulate(
        Model.find(filter)
          .sort({ [sortField]: order === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit),
        extraPopulate
      );

      const items = [];
      for (const doc of docs) {
        items.push(await serialize(doc));
      }

      return res.status(200).json({
        items,
        page,
        limit,
        total,
        totalPages,
        sort: sortField,
        order,
        search,
        filters: { createdBy: createdBy || null },
      });
    } catch (error) {
      return handleControllerError(res, error, `Error listing ${noun.toLowerCase()}s`);
    }
  }

  async function create(req, res) {
    try {
      const parsed = await parseBody(req.body, { partial: false });
      const doc = await Model.create({
        ...parsed,
        kind,
        assetType,
        ownerId: req.user._id,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });
      const loaded = await applyPopulate(Model.findById(doc._id), extraPopulate);
      return res.status(201).json(await serialize(loaded));
    } catch (error) {
      return handleControllerError(res, error, `Error creating ${noun.toLowerCase()}`);
    }
  }

  async function getById(req, res) {
    try {
      const doc = await applyPopulate(
        Model.findOne(activeFilter({ _id: req.params.id })),
        extraPopulate
      );
      if (!doc) {
        return sendError(res, 404, notFound, ERROR_CODES.NOT_FOUND);
      }
      return res.status(200).json(await serialize(doc));
    } catch (error) {
      return handleControllerError(res, error, `Error fetching ${noun.toLowerCase()}`);
    }
  }

  async function update(req, res) {
    try {
      const doc = await Model.findOne(activeFilter({ _id: req.params.id }));
      if (!doc) {
        return sendError(res, 404, notFound, ERROR_CODES.NOT_FOUND);
      }
      const parsed = await parseBody(req.body, { partial: true });
      for (const [key, value] of Object.entries(parsed)) {
        doc[key] = value;
      }
      doc.updatedBy = req.user._id;
      await doc.save();
      const loaded = await applyPopulate(Model.findById(doc._id), extraPopulate);
      return res.status(200).json(await serialize(loaded));
    } catch (error) {
      return handleControllerError(res, error, `Error updating ${noun.toLowerCase()}`);
    }
  }

  async function remove(req, res) {
    try {
      const doc = await Model.findOne(activeFilter({ _id: req.params.id }));
      if (!doc) {
        return sendError(res, 404, notFound, ERROR_CODES.NOT_FOUND);
      }
      applyTrash(doc, req.user._id);
      await doc.save();
      return res.status(200).json({ message: `${noun} moved to recycle bin.`, _id: String(doc._id) });
    } catch (error) {
      return handleControllerError(res, error, `Error deleting ${noun.toLowerCase()}`);
    }
  }

  return { list, create, getById, update, remove };
}

module.exports = {
  createDomainAssetHandlers,
  toPlain,
  handleControllerError,
};
