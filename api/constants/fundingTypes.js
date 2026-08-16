/**
 * Enums for Sponsor / Opportunity / Project domain fields.
 * Shared by models, controllers, and OpenAPI.
 */

const SPONSOR_ORIGEM = [
  'emp_com_fins_lucrativos',
  'emp_publica',
  'ent_sem_fins_lucrativos',
  'fundacoes',
  'gov_estadual',
  'gov_federal',
  'gov_municipal',
  'institutos',
  'org_internacional',
  'pessoa_fisica',
  'sociedade_economia_mista',
];

const OPPORTUNITY_TYPE = ['financial', 'technical', 'educational', 'other'];

const OPPORTUNITY_CATEGORY = [
  'call',
  'financing',
  'award',
  'competition',
  'scholarship',
  'cooperation',
  'tax_incentive_law',
  'sponsorship',
  'donation',
  'emergency_transfer',
  'financial_incentive',
  'transfer_fund_to_fund',
  'special_transfers',
  'legal_discretionary_transfers',
  'partnership_management_transfer',
  'special_state_transfer',
  'new_pac',
  'funds',
  'other',
];

const OPPORTUNITY_ELIGIBILITY = [
  'municipal_public_administration',
  'state_public_administration',
  'public_consortiums',
  'nonprofit_entities',
  'for_profit_companies',
  'icts_heis',
  'startups',
  's_system',
  'other',
];

/** Suggested UI values; API accepts any non-empty string. */
const PROJECT_STATUSES = ['draft', 'in-progress', 'completed', 'cancelled'];

const RELATED_ENTITY_TYPES = ['county', 'state', 'biome', 'region', 'microregion'];

const DEFAULT_CURRENCY = 'R$ BRL';

module.exports = {
  SPONSOR_ORIGEM,
  OPPORTUNITY_TYPE,
  OPPORTUNITY_CATEGORY,
  OPPORTUNITY_ELIGIBILITY,
  PROJECT_STATUSES,
  RELATED_ENTITY_TYPES,
  DEFAULT_CURRENCY,
};
