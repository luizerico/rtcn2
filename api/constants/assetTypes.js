/**
 * RBAC asset kinds — each maps to its own MongoDB collection.
 * Questions are embedded on Survey (not a separate model).
 * SurveyResponse is storage-only and is not an RBAC permission resource.
 */

const ASSET_KINDS = ['DOCUMENT', 'DASHBOARD', 'DATASET', 'SURVEY'];

/** Human-readable type labels stored on documents as assetType (not discriminators). */
const ASSET_TYPE_LABELS = {
  DOCUMENT: 'Document',
  DASHBOARD: 'Dashboard',
  DATASET: 'Dataset',
  SURVEY: 'Survey',
};

/** @deprecated Use ASSET_TYPE_LABELS — kept as alias for older imports. */
const ASSET_DISCRIMINATORS = ASSET_TYPE_LABELS;

const QUESTION_TYPES = ['text', 'multiple_choice', 'yes_no'];

function kindToDiscriminator(kind) {
  return ASSET_TYPE_LABELS[String(kind || '').toUpperCase()] || null;
}

module.exports = {
  ASSET_KINDS,
  ASSET_TYPE_LABELS,
  ASSET_DISCRIMINATORS,
  QUESTION_TYPES,
  kindToDiscriminator,
};
