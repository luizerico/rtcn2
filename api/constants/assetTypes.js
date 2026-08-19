/**
 * RBAC asset kinds — each maps to its own MongoDB collection.
 * SURVEY is the instrument definition. Embedded questions and responses are not asset kinds.
 * COUNTY is a permission subject (geo catalog), not an Asset kind.
 */

const ASSET_KINDS = [
  'SURVEY',
  'SPONSOR',
  'OPPORTUNITY',
  'PROJECT',
  'LOCALPLAN',
];

/** Human-readable type labels stored on documents as assetType (not discriminators). */
const ASSET_TYPE_LABELS = {
  SURVEY: 'Survey',
  SPONSOR: 'Sponsor',
  OPPORTUNITY: 'Opportunity',
  PROJECT: 'Project',
  LOCALPLAN: 'Local plan',
};

/** @deprecated Use ASSET_TYPE_LABELS — kept as alias for older imports. */
const ASSET_DISCRIMINATORS = ASSET_TYPE_LABELS;

const QUESTION_TYPES = ['score', 'text', 'multiple_choice', 'yes_no'];

const INSTRUMENT_TYPES = ['scored_diagnostic', 'poll'];

const INSTRUMENT_STATUSES = ['draft', 'active', 'archived'];

const RESPONSE_STATUSES = ['in_progress', 'pending', 'need_changes', 'approved', 'archived'];

const SUBJECT_TYPES = ['COUNTY', 'PROJECT', 'OPPORTUNITY', 'SPONSOR'];

function kindToDiscriminator(kind) {
  return ASSET_TYPE_LABELS[String(kind || '').toUpperCase()] || null;
}

module.exports = {
  ASSET_KINDS,
  ASSET_TYPE_LABELS,
  ASSET_DISCRIMINATORS,
  QUESTION_TYPES,
  INSTRUMENT_TYPES,
  INSTRUMENT_STATUSES,
  RESPONSE_STATUSES,
  SUBJECT_TYPES,
  kindToDiscriminator,
};
