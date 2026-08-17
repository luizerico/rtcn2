const multer = require('multer');
const { assertAllowedUploadMeta, maxFileBytes, maxFileCount } = require('../services/fileTypes');
const { sendError, ERROR_CODES } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');

function fileFilter(_req, file, cb) {
  try {
    assertAllowedUploadMeta(file.originalname, file.mimetype);
    cb(null, true);
  } catch (error) {
    cb(error);
  }
}

function createMulter() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileBytes(), files: maxFileCount() },
    fileFilter,
  });
}

function handleMulterError(err, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return sendError(res, 413, 'File is too large.', { code: 'PAYLOAD_TOO_LARGE' });
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return sendError(res, 400, `Too many files. Maximum is ${maxFileCount()}.`, ERROR_CODES.VALIDATION);
  }
  if (err instanceof ValidationError) {
    return sendError(res, err.statusCode || 400, err.message, {
      code: err.code || ERROR_CODES.VALIDATION,
    });
  }
  return sendError(res, 400, err.message || 'Invalid file upload.', ERROR_CODES.VALIDATION);
}

function single(fieldName = 'file') {
  return (req, res, next) => {
    createMulter().single(fieldName)(req, res, (err) => handleMulterError(err, res, next));
  };
}

function array(fieldName = 'file', maxCount) {
  return (req, res, next) => {
    createMulter().array(fieldName, maxCount || maxFileCount())(req, res, (err) =>
      handleMulterError(err, res, next)
    );
  };
}

module.exports = { single, array };
