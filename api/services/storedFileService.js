const crypto = require('crypto');
const mongoose = require('mongoose');
const StoredFile = require('../models/StoredFile');
const { getStorageDriver } = require('./storage');
const { inspectUpload } = require('./fileTypes');
const { userHasPermission } = require('./rbacService');
const { HttpError, ERROR_CODES } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');
const { isTrashed, activeFilter } = require('./trash');

const OWNER_KIND = {
  opportunity: 'OPPORTUNITY',
  project: 'PROJECT',
  sponsor: 'SPONSOR',
  instrument_response: 'COUNTY',
};

const OWNER_MODELS = {
  opportunity: () => require('../models/assets/Opportunity'),
  project: () => require('../models/assets/Project'),
  sponsor: () => require('../models/assets/Sponsor'),
  instrument_response: () => require('../models/survey/InstrumentResponse'),
};

function refId(value) {
  if (!value) return value;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

function serializeAnalysis(analysis) {
  if (!analysis || !analysis.jobId) return null;
  return {
    jobId: analysis.jobId,
    status: analysis.status || null,
    result: analysis.result || null,
    error: analysis.error || null,
    model: analysis.model || null,
    requestedAt: analysis.requestedAt || null,
    completedAt: analysis.completedAt || null,
  };
}

function serializeStoredFile(doc) {
  if (!doc) return doc;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  return {
    _id: String(obj._id),
    name: obj.displayName,
    displayName: obj.displayName,
    originalName: obj.originalName,
    storedName: obj.storedName,
    mimeType: obj.mimeType,
    sizeBytes: obj.sizeBytes,
    sha256: obj.sha256,
    ownerType: obj.ownerType,
    ownerId: refId(obj.ownerId),
    obs: obj.obs || '',
    questionId: obj.questionId || null,
    storageDriver: obj.storageDriver,
    analysis: serializeAnalysis(obj.analysis),
    uploadedBy: obj.uploadedBy,
    updatedBy: obj.updatedBy || null,
    deletedAt: obj.deletedAt || null,
    deletedBy: obj.deletedBy || null,
    ownerLabel: obj.ownerLabel || '',
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

async function requireOwner(ownerType, ownerId) {
  const load = OWNER_MODELS[ownerType];
  if (!load) {
    throw new HttpError(400, 'Unknown file owner type.', { code: ERROR_CODES.VALIDATION });
  }
  if (!mongoose.isValidObjectId(ownerId)) {
    throw new HttpError(400, 'Invalid owner id.', { code: ERROR_CODES.VALIDATION });
  }
  const doc = await load().findOne(activeFilter({ _id: ownerId })).select('_id');
  if (!doc) {
    throw new HttpError(404, 'Parent record not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  return doc;
}

async function assertParentFileAccess(user, storedFile, action) {
  if (storedFile.ownerType === 'instrument_response') {
    const response = await require('../models/survey/InstrumentResponse').findById(storedFile.ownerId);
    if (!response || isTrashed(response)) {
      throw new HttpError(404, 'Parent record not found.', { code: ERROR_CODES.NOT_FOUND });
    }
    const permission = `${response.subjectType}:${action}`;
    const allowed = await userHasPermission(user, permission, {
      resourceId: String(response.subjectId),
    });
    if (!allowed) {
      throw new HttpError(403, `Forbidden: Insufficient permissions for ${permission}.`, {
        code: ERROR_CODES.FORBIDDEN,
      });
    }
    return;
  }
  const kind = OWNER_KIND[storedFile.ownerType];
  if (!kind) {
    throw new HttpError(500, 'Unknown file owner type.', { code: ERROR_CODES.CONFIG });
  }
  const permission = `${kind}:${action}`;
  const allowed = await userHasPermission(user, permission, {
    resourceId: String(storedFile.ownerId),
  });
  if (!allowed) {
    throw new HttpError(403, `Forbidden: Insufficient permissions for ${permission}.`, {
      code: ERROR_CODES.FORBIDDEN,
    });
  }
}

async function populateFile(query) {
  return query
    .populate('uploadedBy', 'username email')
    .populate('updatedBy', 'username email')
    .populate('deletedBy', 'username email');
}

async function snapshotOwnerLabel(ownerType, ownerId) {
  const load = OWNER_MODELS[ownerType];
  if (!load || !mongoose.isValidObjectId(ownerId)) return '';
  const full = await load().findById(ownerId).select('name');
  return full?.name ? String(full.name).slice(0, 255) : '';
}

async function listFilesForOwner(ownerType, ownerId, { questionId } = {}) {
  await requireOwner(ownerType, ownerId);
  const filter = { ownerType, ownerId, deletedAt: null };
  if (questionId) filter.questionId = String(questionId);
  const docs = await populateFile(StoredFile.find(filter).sort({ createdAt: -1 }));
  return docs.map(serializeStoredFile);
}

async function loadStoredFile(id, { includeDeleted = false } = {}) {
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(400, 'Invalid file id.', { code: ERROR_CODES.VALIDATION });
  }
  const doc = await populateFile(StoredFile.findById(id));
  if (!doc || (!includeDeleted && isTrashed(doc))) {
    throw new HttpError(404, 'File not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  return doc;
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new ValidationError(`${label} must be at most ${maxLength} characters.`);
  }
  return text;
}

async function storeUploadedFile({
  ownerType,
  ownerId,
  file,
  displayName,
  obs,
  userId,
  questionId,
  skipOwnerCheck = false,
}) {
  if (!skipOwnerCheck) {
    await requireOwner(ownerType, ownerId);
  }
  if (!file || !file.buffer) {
    throw new ValidationError('A file is required.');
  }

  const inspected = inspectUpload({
    originalName: file.originalname,
    mimeType: file.mimetype,
    buffer: file.buffer,
  });

  const name = optionalText(displayName, 'Display name', 255);
  const note = optionalText(obs, 'Notes', 2000) ?? '';
  const linkedQuestion = optionalText(questionId, 'Question id', 64) || null;
  const storedName = `${crypto.randomUUID()}${inspected.ext}`;
  const storageKey = `${ownerType}/${ownerId}/${storedName}`;
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const driver = getStorageDriver();

  await driver.put({
    key: storageKey,
    buffer: file.buffer,
    contentType: inspected.mimeType,
  });

  try {
    const created = await StoredFile.create({
      originalName: inspected.originalName,
      storedName,
      displayName: name || inspected.originalName,
      mimeType: inspected.mimeType,
      sizeBytes: inspected.sizeBytes,
      sha256,
      ownerType,
      ownerId,
      obs: note,
      questionId: linkedQuestion,
      storageDriver: driver.name,
      storageKey,
      uploadedBy: userId,
      updatedBy: userId,
    });
    return populateFile(StoredFile.findById(created._id));
  } catch (error) {
    await driver.remove(storageKey).catch(() => {});
    throw error;
  }
}

function asList(value) {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

async function storeUploadedFiles({ ownerType, ownerId, files, displayNames, obs, userId, questionId }) {
  const list = Array.isArray(files) ? files.filter(Boolean) : files ? [files] : [];
  if (!list.length) {
    throw new ValidationError('A file is required.');
  }
  await requireOwner(ownerType, ownerId);
  const names = asList(displayNames);
  const created = [];
  try {
    for (let i = 0; i < list.length; i += 1) {
      const doc = await storeUploadedFile({
        ownerType,
        ownerId,
        file: list[i],
        displayName: names[i],
        obs,
        userId,
        questionId,
        skipOwnerCheck: true,
      });
      created.push(doc);
    }
    return created;
  } catch (error) {
    for (const doc of created) {
      await purgeStoredFile(doc).catch(() => {});
    }
    throw error;
  }
}

async function updateStoredFile(doc, { displayName, obs, userId }) {
  if (isTrashed(doc)) {
    throw new HttpError(404, 'File not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  if (displayName !== undefined) {
    const name = optionalText(displayName, 'Display name', 255);
    if (!name) {
      throw new ValidationError('Display name is required.');
    }
    doc.displayName = name;
  }
  if (obs !== undefined) {
    doc.obs = optionalText(obs, 'Notes', 2000) ?? '';
  }
  doc.updatedBy = userId;
  await doc.save();
  return populateFile(StoredFile.findById(doc._id));
}

async function trashStoredFile(doc, userId) {
  if (isTrashed(doc)) {
    throw new HttpError(404, 'File not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  doc.deletedAt = new Date();
  doc.deletedBy = userId;
  doc.updatedBy = userId;
  doc.ownerLabel = await snapshotOwnerLabel(doc.ownerType, doc.ownerId);
  await doc.save();
  return populateFile(StoredFile.findById(doc._id));
}

async function restoreStoredFile(doc, userId) {
  if (!isTrashed(doc)) {
    throw new ValidationError('File is not in the recycle bin.');
  }
  await requireOwner(doc.ownerType, doc.ownerId);
  doc.deletedAt = null;
  doc.deletedBy = null;
  doc.updatedBy = userId;
  await doc.save();
  return populateFile(StoredFile.findById(doc._id));
}

async function purgeStoredFile(doc) {
  const driver = getStorageDriver();
  try {
    await driver.remove(doc.storageKey);
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 404) && error?.status !== 404) {
      throw error;
    }
  }
  await StoredFile.deleteOne({ _id: doc._id });
}

async function listTrashedFiles() {
  const docs = await populateFile(StoredFile.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 }));
  return docs.map(serializeStoredFile);
}

async function emptyTrash() {
  const docs = await StoredFile.find({ deletedAt: { $ne: null } });
  for (const doc of docs) {
    await purgeStoredFile(doc);
  }
  return docs.length;
}

async function openStoredFile(doc) {
  const driver = getStorageDriver();
  try {
    return await driver.get(doc.storageKey);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error?.status === 404) {
      throw new HttpError(404, 'File not found in storage.', { code: ERROR_CODES.NOT_FOUND });
    }
    throw error;
  }
}

function contentDisposition(storedFile) {
  const inline = String(storedFile.mimeType || '').startsWith('image/');
  const type = inline ? 'inline' : 'attachment';
  const original = String(storedFile.originalName || 'download').replace(/["\r\n]/g, '_');
  const encoded = encodeURIComponent(original);
  return `${type}; filename="${original}"; filename*=UTF-8''${encoded}`;
}

module.exports = {
  OWNER_KIND,
  serializeAnalysis,
  serializeStoredFile,
  requireOwner,
  assertParentFileAccess,
  listFilesForOwner,
  loadStoredFile,
  storeUploadedFile,
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
};
