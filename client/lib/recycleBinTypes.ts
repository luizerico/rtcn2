export type RecycleBinItemType =
  | 'FILE'
  | 'USER'
  | 'GROUP'
  | 'SURVEY'
  | 'SPONSOR'
  | 'OPPORTUNITY'
  | 'PROJECT';

export type RecycleBinActor = {
  _id?: string;
  username?: string;
  email?: string;
};

export type RecycleBinItem = {
  itemType: RecycleBinItemType | string;
  _id: string;
  name: string;
  detail?: string;
  deletedAt?: string | null;
  deletedBy?: RecycleBinActor | string | null;
};

export const BIN_TYPE_LABELS: Record<string, string> = {
  FILE: 'File',
  USER: 'User',
  GROUP: 'Group',
  SURVEY: 'Survey',
  SPONSOR: 'Sponsor',
  OPPORTUNITY: 'Opportunity',
  PROJECT: 'Project',
};

export const BIN_TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'FILE', label: 'File' },
  { value: 'USER', label: 'User' },
  { value: 'GROUP', label: 'Group' },
  { value: 'SPONSOR', label: 'Sponsor' },
  { value: 'OPPORTUNITY', label: 'Opportunity' },
  { value: 'PROJECT', label: 'Project' },
  { value: 'SURVEY', label: 'Survey' },
];

export function binTypeLabel(itemType: string): string {
  return BIN_TYPE_LABELS[itemType] || itemType;
}

export function binActorLabel(actor?: RecycleBinActor | string | null): string {
  if (!actor) return '—';
  if (typeof actor === 'string') return actor;
  return actor.username || actor.email || '—';
}
