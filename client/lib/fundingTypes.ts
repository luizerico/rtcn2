export const SPONSOR_ORIGEM = [
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
] as const;

export const OPPORTUNITY_TYPE = ['financial', 'technical', 'educational', 'other'] as const;

export const OPPORTUNITY_CATEGORY = [
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
] as const;

export const OPPORTUNITY_ELIGIBILITY = [
  'municipal_public_administration',
  'state_public_administration',
  'public_consortiums',
  'nonprofit_entities',
  'for_profit_companies',
  'icts_heis',
  'startups',
  's_system',
  'other',
] as const;

export const PROJECT_STATUSES = ['draft', 'in-progress', 'completed', 'cancelled'] as const;

export const RELATED_ENTITY_TYPES = ['county', 'state', 'biome', 'region', 'microregion'] as const;

export const DEFAULT_CURRENCY = 'R$ BRL';

export function enumLabel(value: string): string {
  return value
    .split('_')
    .map((part) => (part === 's' ? 'S' : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

export interface UserRef {
  _id?: string;
  username?: string;
  email?: string;
}

export interface FundingListResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  sort: string;
  order: 'asc' | 'desc';
  search: string;
}

export interface SponsorRecord {
  _id: string;
  name: string;
  description?: string;
  orgEmail: string;
  origem: string;
  orgUnit?: string;
  webpage?: string;
  email?: string;
  socialMedia?: string;
  contact: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  obs?: string;
  createdAt?: string;
  updatedAt?: string;
  ownerId?: UserRef | string;
  createdBy?: UserRef | string;
}

export interface OpportunityRecord {
  _id: string;
  name: string;
  description: string;
  sponsor: SponsorRecord | string;
  type: string;
  category: string;
  eligibility: string;
  website: string;
  submissionMethod: string;
  startDate: string;
  endDate?: string | null;
  continuous?: boolean;
  budget: number;
  totalBudget?: number | null;
  currency?: string;
  obs?: string[];
  documents?: string[];
  createdAt?: string;
  updatedAt?: string;
  ownerId?: UserRef | string;
}

export interface RelatedEntity {
  entityType?: string;
  entityId?: string[];
}

export interface GeoOption {
  _id: string;
  code?: string;
  name: string;
}

export interface ProjectRecord {
  _id: string;
  name: string;
  description: string;
  opportunity?: OpportunityRecord | string | null;
  relatedEntity?: RelatedEntity;
  relatedEntities?: GeoOption[];
  projWebsite: string;
  projStartDate: string;
  projEndDate?: string | null;
  projBudget: number;
  currency?: string;
  projStatus: string;
  projComments?: string[];
  projDocuments?: string[];
  obs?: string;
  createdAt?: string;
  updatedAt?: string;
  ownerId?: UserRef | string;
}

export function ownerName(value?: UserRef | string): string {
  if (value && typeof value === 'object') {
    return value.username || value.email || '—';
  }
  return '—';
}

export function refId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && '_id' in value) {
    return String((value as { _id: string })._id);
  }
  return '';
}

export function refName(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const row = value as { name?: string };
  return row.name || '';
}

export function toDateInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}
