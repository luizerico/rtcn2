const { asyncHandler, sendError, ERROR_CODES, HttpError } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');
const {
  serializeStoredFile,
  assertParentFileAccess,
  listFilesForOwner,
  loadStoredFile,
  storeUploadedFiles,
  updateStoredFile,
  trashStoredFile,
  restoreStoredFile,
  purgeStoredFile,
  listTrashedFiles,
  emptyTrash,
  isTrashed,
  openStoredFile,
  contentDisposition,
} = require('../services/storedFileService');

function handleFileError(res, error, fallback) {
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

async function pipeDownload(res, doc) {
  const payload = await openStoredFile(doc);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', contentDisposition(doc));
  if (payload.contentLength) {
    res.setHeader('Content-Length', String(payload.contentLength));
  } else if (doc.sizeBytes) {
    res.setHeader('Content-Length', String(doc.sizeBytes));
  }
  payload.stream.on('error', (error) => {
    if (!res.headersSent) {
      handleFileError(res, error, 'Failed to download file.');
    } else {
      res.destroy(error);
    }
  });
  return payload.stream.pipe(res);
}

function createOwnerFileHandlers(ownerType) {
  const list = asyncHandler(async (req, res) => {
    try {
      const items = await listFilesForOwner(ownerType, req.params.id);
      return res.json({ items });
    } catch (error) {
      return handleFileError(res, error, 'Failed to list files.');
    }
  });

  const upload = asyncHandler(async (req, res) => {
    try {
      const docs = await storeUploadedFiles({
        ownerType,
        ownerId: req.params.id,
        files: req.files && req.files.length ? req.files : req.file,
        displayNames: req.body?.displayName,
        obs: req.body?.obs,
        userId: req.user._id,
      });
      return res.status(201).json({ items: docs.map(serializeStoredFile) });
    } catch (error) {
      return handleFileError(res, error, 'Failed to upload file.');
    }
  });

  return { list, upload };
}

const getFile = asyncHandler(async (req, res) => {
  try {
    const doc = await loadStoredFile(req.params.id);
    await assertParentFileAccess(req.user, doc, 'READ');
    return res.json(serializeStoredFile(doc));
  } catch (error) {
    return handleFileError(res, error, 'Failed to load file.');
  }
});

const downloadFile = asyncHandler(async (req, res) => {
  try {
    const doc = await loadStoredFile(req.params.id);
    await assertParentFileAccess(req.user, doc, 'READ');
    return pipeDownload(res, doc);
  } catch (error) {
    return handleFileError(res, error, 'Failed to download file.');
  }
});

const updateFile = asyncHandler(async (req, res) => {
  try {
    const doc = await loadStoredFile(req.params.id);
    await assertParentFileAccess(req.user, doc, 'WRITE');
    const updated = await updateStoredFile(doc, {
      displayName: req.body?.displayName,
      obs: req.body?.obs,
      userId: req.user._id,
    });
    return res.json(serializeStoredFile(updated));
  } catch (error) {
    return handleFileError(res, error, 'Failed to update file.');
  }
});

const removeFile = asyncHandler(async (req, res) => {
  try {
    const doc = await loadStoredFile(req.params.id);
    await assertParentFileAccess(req.user, doc, 'WRITE');
    await trashStoredFile(doc, req.user._id);
    return res.json({ message: 'File moved to recycle bin.', _id: String(doc._id) });
  } catch (error) {
    return handleFileError(res, error, 'Failed to delete file.');
  }
});

const listBin = asyncHandler(async (req, res) => {
  try {
    const items = await listTrashedFiles();
    return res.json({ items });
  } catch (error) {
    return handleFileError(res, error, 'Failed to list recycle bin.');
  }
});

const restoreBinFile = asyncHandler(async (req, res) => {
  try {
    const doc = await loadStoredFile(req.params.id, { includeDeleted: true });
    if (!isTrashed(doc)) {
      return sendError(res, 400, 'File is not in the recycle bin.', ERROR_CODES.VALIDATION);
    }
    const restored = await restoreStoredFile(doc, req.user._id);
    return res.json(serializeStoredFile(restored));
  } catch (error) {
    return handleFileError(res, error, 'Failed to restore file.');
  }
});

const purgeBinFile = asyncHandler(async (req, res) => {
  try {
    const doc = await loadStoredFile(req.params.id, { includeDeleted: true });
    if (!isTrashed(doc)) {
      return sendError(res, 400, 'File is not in the recycle bin.', ERROR_CODES.VALIDATION);
    }
    await purgeStoredFile(doc);
    return res.json({ message: 'File permanently deleted.', _id: String(doc._id) });
  } catch (error) {
    return handleFileError(res, error, 'Failed to permanently delete file.');
  }
});

const emptyBin = asyncHandler(async (req, res) => {
  try {
    const deleted = await emptyTrash();
    return res.json({ message: 'Recycle bin emptied.', deleted });
  } catch (error) {
    return handleFileError(res, error, 'Failed to empty recycle bin.');
  }
});

const downloadBinFile = asyncHandler(async (req, res) => {
  try {
    const doc = await loadStoredFile(req.params.id, { includeDeleted: true });
    if (!isTrashed(doc)) {
      return sendError(res, 404, 'File not found.', ERROR_CODES.NOT_FOUND);
    }
    return pipeDownload(res, doc);
  } catch (error) {
    return handleFileError(res, error, 'Failed to download file.');
  }
});

module.exports = {
  createOwnerFileHandlers,
  getFile,
  downloadFile,
  updateFile,
  removeFile,
  listBin,
  restoreBinFile,
  purgeBinFile,
  emptyBin,
  downloadBinFile,
};
