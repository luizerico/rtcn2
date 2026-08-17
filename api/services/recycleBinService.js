const mongoose = require('mongoose');
const User = require('../models/User');
const Group = require('../models/Group');
const Permission = require('../models/Permission');
const StoredFile = require('../models/StoredFile');
const SurveyResponse = require('../models/assets/SurveyResponse');
const { KIND_MODELS, ASSET_KINDS, modelForKind } = require('../models/assets');
const { trashedFilter, isTrashed, clearTrash, activeFilter } = require('./trash');
const {
  serializeStoredFile,
  restoreStoredFile,
  purgeStoredFile,
  loadStoredFile,
} = require('./storedFileService');
const { HttpError, ERROR_CODES } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');

const FILE_OWNER_TYPES = {
  OPPORTUNITY: 'opportunity',
  PROJECT: 'project',
  SPONSOR: 'sponsor',
};

const ITEM_TYPES = new Set(['FILE', 'USER', 'GROUP', ...ASSET_KINDS]);

function normalizeType(value) {
  return String(value || '').toUpperCase();
}

function actorRef(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    return {
      _id: String(value._id || value.id || ''),
      username: value.username,
      email: value.email,
    };
  }
  return { _id: String(value) };
}

function toBinItem(itemType, doc, name, detail = '') {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    itemType,
    _id: String(obj._id),
    name,
    detail,
    deletedAt: obj.deletedAt || null,
    deletedBy: actorRef(obj.deletedBy),
  };
}

async function populateDeletedBy(query) {
  return query.populate('deletedBy', 'username email');
}

async function listBinItems(typeFilter) {
  const type = normalizeType(typeFilter);
  if (type && !ITEM_TYPES.has(type)) {
    throw new ValidationError(`Unknown recycle bin type: ${typeFilter}`);
  }

  const items = [];
  const include = (itemType) => !type || type === itemType;

  if (include('FILE')) {
    const files = await populateDeletedBy(
      StoredFile.find(trashedFilter()).sort({ deletedAt: -1 })
    );
    for (const doc of files) {
      const serialized = serializeStoredFile(doc);
      items.push(
        toBinItem(
          'FILE',
          doc,
          serialized.displayName,
          [serialized.originalName, serialized.ownerLabel].filter(Boolean).join(' · ')
        )
      );
    }
  }

  if (include('USER')) {
    const users = await populateDeletedBy(User.find(trashedFilter()).sort({ deletedAt: -1 }));
    for (const doc of users) {
      items.push(toBinItem('USER', doc, doc.username, doc.email));
    }
  }

  if (include('GROUP')) {
    const groups = await populateDeletedBy(Group.find(trashedFilter()).sort({ deletedAt: -1 }));
    for (const doc of groups) {
      items.push(toBinItem('GROUP', doc, doc.name, doc.description || ''));
    }
  }

  for (const kind of ASSET_KINDS) {
    if (!include(kind)) continue;
    const Model = KIND_MODELS[kind];
    if (!Model) continue;
    const docs = await populateDeletedBy(Model.find(trashedFilter()).sort({ deletedAt: -1 }));
    for (const doc of docs) {
      items.push(toBinItem(kind, doc, doc.name, doc.description || ''));
    }
  }

  items.sort((a, b) => {
    const at = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
    const bt = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
    return bt - at;
  });
  return items;
}

async function loadTrashed(itemType, id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(400, 'Invalid id.', { code: ERROR_CODES.VALIDATION });
  }
  const type = normalizeType(itemType);
  if (!ITEM_TYPES.has(type)) {
    throw new ValidationError(`Unknown recycle bin type: ${itemType}`);
  }

  if (type === 'FILE') {
    const doc = await loadStoredFile(id, { includeDeleted: true });
    if (!isTrashed(doc)) {
      throw new ValidationError('Item is not in the recycle bin.');
    }
    return { type, doc };
  }
  if (type === 'USER') {
    const doc = await User.findById(id);
    if (!doc || !isTrashed(doc)) {
      throw new HttpError(404, 'Item not found in the recycle bin.', { code: ERROR_CODES.NOT_FOUND });
    }
    return { type, doc };
  }
  if (type === 'GROUP') {
    const doc = await Group.findById(id);
    if (!doc || !isTrashed(doc)) {
      throw new HttpError(404, 'Item not found in the recycle bin.', { code: ERROR_CODES.NOT_FOUND });
    }
    return { type, doc };
  }

  const Model = modelForKind(type);
  if (!Model) {
    throw new ValidationError(`Unknown recycle bin type: ${itemType}`);
  }
  const doc = await Model.findById(id);
  if (!doc || !isTrashed(doc)) {
    throw new HttpError(404, 'Item not found in the recycle bin.', { code: ERROR_CODES.NOT_FOUND });
  }
  return { type, doc };
}

async function restoreBinItem(itemType, id, userId) {
  const { type, doc } = await loadTrashed(itemType, id);

  if (type === 'FILE') {
    const restored = await restoreStoredFile(doc, userId);
    const serialized = serializeStoredFile(restored);
    return toBinItem('FILE', restored, serialized.displayName, serialized.originalName);
  }

  if (type === 'USER') {
    const clash = await User.findOne(
      activeFilter({
        _id: { $ne: doc._id },
        $or: [{ username: doc.username }, { email: doc.email }],
      })
    ).select('_id username email');
    if (clash) {
      throw new HttpError(409, 'Cannot restore: username or email is already in use.', {
        code: ERROR_CODES.CONFLICT,
      });
    }
    clearTrash(doc, userId);
    await doc.save();
    return toBinItem('USER', doc, doc.username, doc.email);
  }

  if (type === 'GROUP') {
    const clash = await Group.findOne(activeFilter({ _id: { $ne: doc._id }, name: doc.name })).select(
      '_id name'
    );
    if (clash) {
      throw new HttpError(409, 'Cannot restore: group name is already in use.', {
        code: ERROR_CODES.CONFLICT,
      });
    }
    clearTrash(doc, userId);
    await doc.save();
    return toBinItem('GROUP', doc, doc.name, doc.description || '');
  }

  clearTrash(doc, userId);
  await doc.save();
  return toBinItem(type, doc, doc.name, doc.description || '');
}

async function purgeFilesForOwner(ownerType, ownerId) {
  const files = await StoredFile.find({ ownerType, ownerId });
  for (const file of files) {
    await purgeStoredFile(file);
  }
}

async function purgeBinItem(itemType, id) {
  const { type, doc } = await loadTrashed(itemType, id);

  if (type === 'FILE') {
    await purgeStoredFile(doc);
    return { itemType: type, _id: String(doc._id) };
  }

  if (type === 'USER') {
    await Group.updateMany({ members: doc._id }, { $pull: { members: doc._id } });
    await doc.deleteOne();
    return { itemType: type, _id: String(doc._id) };
  }

  if (type === 'GROUP') {
    await Permission.deleteMany({
      $or: [{ principalType: 'GROUP', principalId: doc._id }, { groupId: doc._id }],
    });
    await User.updateMany({ roleId: doc._id }, { $set: { roleId: null } });
    await doc.deleteOne();
    return { itemType: type, _id: String(doc._id) };
  }

  const ownerType = FILE_OWNER_TYPES[type];
  if (ownerType) {
    await purgeFilesForOwner(ownerType, doc._id);
  }
  if (type === 'SURVEY') {
    await SurveyResponse.deleteMany({ surveyId: doc._id });
  }
  await doc.deleteOne();
  return { itemType: type, _id: String(doc._id) };
}

async function emptyBin() {
  const items = await listBinItems();
  const purgeOrder = { FILE: 0, USER: 1, GROUP: 2 };
  items.sort((a, b) => (purgeOrder[a.itemType] ?? 3) - (purgeOrder[b.itemType] ?? 3));

  let deleted = 0;
  for (const item of items) {
    try {
      await purgeBinItem(item.itemType, item._id);
      deleted += 1;
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) continue;
      throw error;
    }
  }
  return deleted;
}

module.exports = {
  ITEM_TYPES,
  listBinItems,
  restoreBinItem,
  purgeBinItem,
  emptyBin,
};
