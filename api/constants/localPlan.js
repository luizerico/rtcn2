/**
 * Local plan enums, area labels, scoring, and legacy sample-data mapping.
 * Keep in sync with client/lib/localPlan.ts.
 */

const LOCALPLAN_STATUSES = ['draft', 'default', 'archived'];
const INCLUSION_MODES = ['gaps', 'all', 'selected'];
const YES_NO = ['yes', 'no'];
const LEVELS = ['low', 'medium', 'high'];
const PRIORITY_TERMS = ['short', 'medium', 'long'];
const CHANGE_REASONS = ['create', 'import', 'survey_revision', 'set_default', 'manual'];

const AREA_LABELS = {
  MC: 'Mudanças Climáticas',
  GT: 'Gestão Territorial',
  CA: 'Capacidade Administrativa',
  CF: 'Capacidade Financeira',
  GV: 'Governança',
  AN: 'Ambiente de Negócios',
};

const LEVEL_SCORE = { low: 0, medium: 1, high: 2 };
const YES_SCORE = { yes: 1, no: 0 };

function areaLabel(code) {
  const key = String(code || '').trim().toUpperCase();
  if (AREA_LABELS[key]) return AREA_LABELS[key];
  return String(code || '').trim() || 'General';
}

function normalizeYesNo(value, fallback = 'no') {
  const raw = String(value || '').trim().toLowerCase();
  if (YES_NO.includes(raw)) return raw;
  return fallback;
}

function normalizeLevel(value, fallback = 'medium') {
  const raw = String(value || '').trim().toLowerCase();
  if (LEVELS.includes(raw)) return raw;
  return fallback;
}

function mapLegacyYesNo(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 'no';
  return 'yes';
}

function mapLegacyLevel(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 'low';
  if (num <= 2) return 'medium';
  return 'high';
}

function computeTechnicalPriority(technical = {}) {
  const complexity = technical.complexity || {};
  const opportunities = technical.opportunities || {};
  const admin = LEVEL_SCORE[normalizeLevel(complexity.administrative)] ?? 1;
  const financial = LEVEL_SCORE[normalizeLevel(complexity.financial)] ?? 1;
  const federal = YES_SCORE[normalizeYesNo(opportunities.federal)] ?? 0;
  const state = YES_SCORE[normalizeYesNo(opportunities.state)] ?? 0;
  const partners = YES_SCORE[normalizeYesNo(opportunities.partners)] ?? 0;
  const mandatory = technical.isMandatory ? 2 : 0;
  const score = 2 - admin + (2 - financial) + federal + state + partners + mandatory;
  return { term: bucketTerm(score, 6, 3), score };
}

function computeGovernmentPriority(consultant = {}, isLocalAgenda = false) {
  const financial = LEVEL_SCORE[normalizeLevel(consultant.financialCapacity)] ?? 1;
  const plan = LEVEL_SCORE[normalizeLevel(consultant.planCapacity)] ?? 1;
  const inter = LEVEL_SCORE[normalizeLevel(consultant.interCooperation)] ?? 1;
  const score = financial + plan + inter + (isLocalAgenda ? 1 : 0);
  return { term: bucketTerm(score, 5, 3), score };
}

function bucketTerm(score, shortAt, mediumAt) {
  if (score >= shortAt) return 'short';
  if (score >= mediumAt) return 'medium';
  return 'long';
}

function formatPriority(priority) {
  if (!priority || priority.term == null) return '—';
  const labels = { short: 'Short Term', medium: 'Medium Term', long: 'Long Term' };
  const label = labels[priority.term] || 'Medium Term';
  return `${label} - ${priority.score}`;
}

function defaultTechnical() {
  return {
    opportunities: { federal: 'no', state: 'no', partners: 'no' },
    complexity: { administrative: 'medium', financial: 'medium' },
    isMandatory: false,
  };
}

function defaultConsultant() {
  return {
    financialCapacity: 'medium',
    planCapacity: 'medium',
    interCooperation: 'medium',
  };
}

function withPriorities(entry) {
  const technical = entry.technical || defaultTechnical();
  const consultant = entry.consultant || defaultConsultant();
  const isLocalAgenda = Boolean(entry.isLocalAgenda);
  return {
    ...entry,
    technical,
    consultant,
    isLocalAgenda,
    technicalPriority: computeTechnicalPriority(technical),
    governmentPriority: computeGovernmentPriority(consultant, isLocalAgenda),
  };
}

module.exports = {
  LOCALPLAN_STATUSES,
  INCLUSION_MODES,
  YES_NO,
  LEVELS,
  PRIORITY_TERMS,
  CHANGE_REASONS,
  AREA_LABELS,
  LEVEL_SCORE,
  YES_SCORE,
  areaLabel,
  normalizeYesNo,
  normalizeLevel,
  mapLegacyYesNo,
  mapLegacyLevel,
  computeTechnicalPriority,
  computeGovernmentPriority,
  formatPriority,
  defaultTechnical,
  defaultConsultant,
  withPriorities,
};
