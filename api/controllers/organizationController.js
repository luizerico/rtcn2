const Organization = require('../models/Organization');
const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');
const { activeFilter, applyTrash } = require('../services/trash');
const {
  parseListQuery,
  clampPage,
  paginatedResponse,
  textSearchOr,
  escapeRegex,
} = require('../utils/listQuery');

const ORG_SORT_FIELDS = new Set(['name', 'email', 'createdAt', 'updatedAt']);
const ORG_UPDATE_ALLOWED = ['name', 'description', 'website', 'email', 'phone'];

exports.getAllOrganizations = async (req, res) => {
  try {
    const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
      req.query,
      ORG_SORT_FIELDS,
      'name'
    );

    const filter = activeFilter();
    const qOr = textSearchOr(['name', 'description', 'email'], req.query.q);
    if (qOr) filter.$or = qOr;
    if (req.query.name) {
      filter.name = { $regex: escapeRegex(String(req.query.name).trim()), $options: 'i' };
    }

    const total = await Organization.countDocuments(filter);
    const { page, skip } = clampPage(rawPage, total, limit);

    const items = await Organization.find(filter)
      .sort({ [sortField]: sortOrder, _id: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json(
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
    if (error?.name === 'ValidationError' || error?.status === 400) {
      return sendError(res, 400, error.message, ERROR_CODES.VALIDATION);
    }
    return sendServerError(res, error, 'Error fetching organizations');
  }
};

exports.createOrganization = async (req, res) => {
  try {
    const { name, description, website, email, phone } = req.validated || req.body;

    const existing = await Organization.findOne(activeFilter({ name }));
    if (existing) {
      return sendError(res, 400, 'Organization name already exists.', ERROR_CODES.CONFLICT);
    }

    const organization = await Organization.create({
      name,
      description,
      website,
      email,
      phone,
    });
    res.status(201).json(organization);
  } catch (error) {
    return sendServerError(res, error, 'Error creating organization');
  }
};

exports.getOrganizationById = async (req, res) => {
  try {
    const organization = await Organization.findOne(activeFilter({ _id: req.params.id }));
    if (!organization) {
      return sendError(res, 404, 'Organization not found.', ERROR_CODES.NOT_FOUND);
    }
    res.status(200).json(organization);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching organization');
  }
};

exports.updateOrganization = async (req, res) => {
  try {
    const source = req.validated || req.body;
    const updates = {};
    for (const key of ORG_UPDATE_ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        updates[key] = source[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return sendError(
        res,
        400,
        `No updatable fields provided. Allowed: ${ORG_UPDATE_ALLOWED.join(', ')}.`,
        ERROR_CODES.VALIDATION
      );
    }

    if (updates.name) {
      const clash = await Organization.findOne(
        activeFilter({ name: updates.name, _id: { $ne: req.params.id } })
      ).select('_id');
      if (clash) {
        return sendError(res, 400, 'Organization name already exists.', ERROR_CODES.CONFLICT);
      }
    }

    const updated = await Organization.findOneAndUpdate(activeFilter({ _id: req.params.id }), updates, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!updated) {
      return sendError(res, 404, 'Organization not found.', ERROR_CODES.NOT_FOUND);
    }
    res.status(200).json(updated);
  } catch (error) {
    return sendServerError(res, error, 'Error updating organization');
  }
};

exports.deleteOrganization = async (req, res) => {
  try {
    const organization = await Organization.findOne(activeFilter({ _id: req.params.id }));
    if (!organization) {
      return sendError(res, 404, 'Organization not found.', ERROR_CODES.NOT_FOUND);
    }

    applyTrash(organization, req.user._id);
    await organization.save();

    res.status(200).json({ message: 'Organization moved to recycle bin.' });
  } catch (error) {
    return sendServerError(res, error, 'Error deleting organization');
  }
};
