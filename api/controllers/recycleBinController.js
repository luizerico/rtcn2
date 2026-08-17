const { asyncHandler, sendError, ERROR_CODES, HttpError } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');
const { listBinItems, restoreBinItem, purgeBinItem, emptyBin } = require('../services/recycleBinService');

function handleBinError(res, error, fallback) {
  if (error instanceof HttpError) {
    return sendError(res, error.status, error.message, { code: error.code, details: error.details });
  }
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message, {
      code: error.code || ERROR_CODES.VALIDATION,
    });
  }
  console.error(fallback, error);
  return sendError(res, 500, fallback, ERROR_CODES.INTERNAL);
}

const listBin = asyncHandler(async (req, res) => {
  try {
    const items = await listBinItems(req.query.type);
    return res.json({ items });
  } catch (error) {
    return handleBinError(res, error, 'Failed to list recycle bin.');
  }
});

const restoreItem = asyncHandler(async (req, res) => {
  try {
    const item = await restoreBinItem(req.params.itemType, req.params.id, req.user._id);
    return res.json(item);
  } catch (error) {
    return handleBinError(res, error, 'Failed to restore item.');
  }
});

const purgeItem = asyncHandler(async (req, res) => {
  try {
    const result = await purgeBinItem(req.params.itemType, req.params.id);
    return res.json({ message: 'Item permanently deleted.', ...result });
  } catch (error) {
    return handleBinError(res, error, 'Failed to permanently delete item.');
  }
});

const empty = asyncHandler(async (req, res) => {
  try {
    const deleted = await emptyBin();
    return res.json({ message: 'Recycle bin emptied.', deleted });
  } catch (error) {
    return handleBinError(res, error, 'Failed to empty recycle bin.');
  }
});

module.exports = {
  listBin,
  restoreItem,
  purgeItem,
  empty,
};
