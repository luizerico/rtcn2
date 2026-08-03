/**
 * Asset kinds stored in the `assets` collection.
 * SurveyResponse is its own kind (not nested under Survey for permissions).
 * Questions are not assets — see models/Question.js.
 */

const ASSET_KINDS = ['DOCUMENT', 'DASHBOARD', 'DATASET', 'SURVEY', 'SURVEY_RESPONSE'];

const ASSET_DISCRIMINATORS = {
  DOCUMENT: 'Document',
  DASHBOARD: 'Dashboard',
  DATASET: 'Dataset',
  SURVEY: 'Survey',
  SURVEY_RESPONSE: 'SurveyResponse',
};

const QUESTION_TYPES = ['text', 'multiple_choice', 'yes_no'];

function kindToDiscriminator(kind) {
  return ASSET_DISCRIMINATORS[String(kind || '').toUpperCase()] || null;
}

module.exports = {
  ASSET_KINDS,
  ASSET_DISCRIMINATORS,
  QUESTION_TYPES,
  kindToDiscriminator,
};
