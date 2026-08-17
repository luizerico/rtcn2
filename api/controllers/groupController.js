const Group = require('../models/Group');
const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');
const { activeFilter, applyTrash } = require('../services/trash');
const {
  parseListQuery,
  clampPage,
  paginatedResponse,
  textSearchOr,
  escapeRegex,
} = require('../utils/listQuery');

const GROUP_SORT_FIELDS = new Set(['name', 'createdAt', 'updatedAt', 'memberCount']);

exports.getAllGroups = async (req, res) => {
  try {
    const { page: rawPage, limit, sortField, sortOrder, orderLabel } = parseListQuery(
      req.query,
      GROUP_SORT_FIELDS,
      'name'
    );

    const filter = activeFilter();
    const qOr = textSearchOr(['name', 'description'], req.query.q);
    if (qOr) filter.$or = qOr;
    if (req.query.name) {
      filter.name = { $regex: escapeRegex(String(req.query.name).trim()), $options: 'i' };
    }

    const total = await Group.countDocuments(filter);
    const { page, skip } = clampPage(rawPage, total, limit);

    let items;
    if (sortField === 'memberCount') {
      const aggregated = await Group.aggregate([
        { $match: filter },
        {
          $addFields: {
            memberCount: { $size: { $ifNull: ['$members', []] } },
          },
        },
        { $sort: { memberCount: sortOrder, _id: sortOrder } },
        { $skip: skip },
        { $limit: limit },
      ]);
      items = aggregated;
    } else {
      items = await Group.find(filter)
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean();
    }

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
    return sendServerError(res, error, 'Error fetching groups');
  }
};

exports.createGroup = async (req, res) => {
  try {
    const { name, description } = req.validated || req.body;

    const existing = await Group.findOne(activeFilter({ name }));
    if (existing) {
      return sendError(res, 400, 'Group name already exists.', ERROR_CODES.CONFLICT);
    }

    const newGroup = await Group.create({ name, description });
    res.status(201).json(newGroup);
  } catch (error) {
    return sendServerError(res, error, 'Error creating group');
  }
};

exports.getGroupById = async (req, res) => {
  try {
    const group = await Group.findOne(activeFilter({ _id: req.params.id }));
    if (!group) {
      return sendError(res, 404, 'Group not found.', ERROR_CODES.NOT_FOUND);
    }
    res.status(200).json(group);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching group');
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const GROUP_UPDATE_ALLOWED = ['name', 'description'];
    const updates = {};
    for (const key of GROUP_UPDATE_ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return sendError(
        res,
        400,
        `No updatable fields provided. Allowed: ${GROUP_UPDATE_ALLOWED.join(', ')}.`,
        ERROR_CODES.VALIDATION
      );
    }

    const updatedGroup = await Group.findOneAndUpdate(activeFilter({ _id: req.params.id }), updates, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!updatedGroup) {
      return sendError(res, 404, 'Group not found.', ERROR_CODES.NOT_FOUND);
    }
    res.status(200).json(updatedGroup);
  } catch (error) {
    return sendServerError(res, error, 'Error updating group');
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const groupId = req.params.id;
    const group = await Group.findOne(activeFilter({ _id: groupId }));

    if (!group) {
      return sendError(res, 404, 'Group not found.', ERROR_CODES.NOT_FOUND);
    }

    if (String(group.name).toLowerCase() === 'admin') {
      return sendError(res, 400, 'The admin group cannot be moved to the recycle bin.', ERROR_CODES.BAD_REQUEST);
    }

    applyTrash(group, req.user._id);
    await group.save();

    res.status(200).json({ message: 'Group moved to recycle bin.' });
  } catch (error) {
    return sendServerError(res, error, 'Error deleting group');
  }
};
