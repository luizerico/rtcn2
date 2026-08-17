const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const trashFields = {
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
};

function activeFilter(extra = {}) {
  return { deletedAt: null, ...extra };
}

function trashedFilter(extra = {}) {
  return { deletedAt: { $ne: null }, ...extra };
}

function isTrashed(doc) {
  return Boolean(doc?.deletedAt);
}

function applyTrash(doc, userId) {
  doc.deletedAt = new Date();
  doc.deletedBy = userId || null;
  if (doc.schema?.paths?.updatedBy) {
    doc.updatedBy = userId;
  }
  return doc;
}

function clearTrash(doc, userId) {
  doc.deletedAt = null;
  doc.deletedBy = null;
  if (doc.schema?.paths?.updatedBy && userId) {
    doc.updatedBy = userId;
  }
  return doc;
}

function addPartialUniqueIndex(schema, field) {
  schema.index(
    { [field]: 1 },
    { unique: true, partialFilterExpression: { deletedAt: null } }
  );
}

module.exports = {
  trashFields,
  activeFilter,
  trashedFilter,
  isTrashed,
  applyTrash,
  clearTrash,
  addPartialUniqueIndex,
};
