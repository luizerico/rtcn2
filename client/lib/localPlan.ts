/**
 * Mirrors api/constants/localPlan.js for client display and optimistic scoring.
 */

export const AREA_LABELS: Record<string, string> = {
  MC: 'Mudanças Climáticas',
  GT: 'Gestão Territorial',
  CA: 'Capacidade Administrativa',
  CF: 'Capacidade Financeira',
  GV: 'Governança',
  AN: 'Ambiente de Negócios',
};

export type YesNo = 'yes' | 'no';
export type Level = 'low' | 'medium' | 'high';
export type PriorityTerm = 'short' | 'medium' | 'long';
export type LocalPlanStatus = 'draft' | 'default' | 'archived';
export type InclusionMode = 'gaps' | 'all' | 'selected';

export type Priority = { term: PriorityTerm; score: number };

export type PlanEntry = {
  questionId: string;
  code: string;
  area?: string;
  areaLabel?: string;
  todo?: string;
  technical: {
    opportunities: { federal: YesNo; state: YesNo; partners: YesNo };
    complexity: { administrative: Level; financial: Level };
    isMandatory: boolean;
  };
  consultant: {
    financialCapacity: Level;
    planCapacity: Level;
    interCooperation: Level;
  };
  isLocalAgenda: boolean;
  technicalPriority: Priority;
  governmentPriority: Priority;
};

export type LocalPlanRecord = {
  _id: string;
  name: string;
  status: LocalPlanStatus;
  surveyId: string;
  surveyName?: string;
  countyId: string;
  countyName?: string;
  instrumentResponseId: string;
  sourceRevision: number;
  inclusionMode: InclusionMode;
  includedQuestionIds?: string[];
  entries?: PlanEntry[];
  entryCount?: number;
  obs?: string;
  canWrite?: boolean;
  updatedAt?: string;
  siblings?: Array<{
    _id: string;
    name: string;
    status: LocalPlanStatus;
    sourceRevision: number;
    updatedAt?: string;
  }>;
};

export type LocalPlanChange = {
  _id: string;
  reason: string;
  sourceRevision?: number | null;
  added: Array<{ questionId: string; code?: string; area?: string }>;
  removed: Array<{ questionId: string; code?: string; area?: string }>;
  createdBy?: { username?: string } | null;
  createdAt?: string;
};

export function areaLabel(code?: string) {
  const key = String(code || '').trim().toUpperCase();
  return AREA_LABELS[key] || String(code || '').trim() || 'General';
}

export function formatPriority(priority?: Priority | null) {
  if (!priority || priority.term == null) return '—';
  const labels: Record<PriorityTerm, string> = {
    short: 'Short Term',
    medium: 'Medium Term',
    long: 'Long Term',
  };
  return `${labels[priority.term]} - ${priority.score}`;
}

export function priorityClass(term?: PriorityTerm) {
  if (term === 'short') return 'bg-emerald-100 text-emerald-900';
  if (term === 'long') return 'bg-slate-100 text-slate-800';
  return 'bg-amber-100 text-amber-950';
}

export function formatPlanStatus(status: string) {
  if (status === 'default') return 'Default';
  return status.replaceAll('_', ' ');
}
