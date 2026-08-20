export const PROMPT_MAX = 8000;

export const SCORE_WEIGHTS = {
  gradeUplift: 25,
  localPlanPriority: 20,
  population: 15,
  economic: 10,
  capacity: 10,
  biome: 8,
  region: 6,
  riskReduction: 6,
} as const;

export const DIMENSION_LABELS: Record<string, string> = {
  gradeUplift: 'Grade uplift',
  localPlanPriority: 'Local-plan priority',
  population: 'Population',
  economic: 'Economic',
  capacity: 'Capacity',
  biome: 'Biome',
  region: 'Region',
  riskReduction: 'Risk reduction',
};

export type MatchMode = 'shallow' | 'deep';
export type MatchRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type AiPromptTemplate = {
  key: string;
  name: string;
  body: string;
  maxLength: number;
  updatedAt?: string;
};

export type GradeSnapshot = {
  letter?: string;
  percent?: number | null;
  total?: number | null;
  maxTotal?: number | null;
  byArea?: Record<string, { total: number; maxTotal: number }>;
  surveyId?: string;
  surveyName?: string;
};

export type MatchedCode = {
  code?: string;
  area?: string;
  questionId?: string;
  todo?: string;
  proposedScore?: number | null;
  technicalPriority?: number | null;
  governmentPriority?: number | null;
  reason?: string;
};

export type DimensionScore = {
  score: number;
  note?: string;
};

export type OpportunityCountyMatch = {
  opportunityId: string;
  countyId: string;
  countyName: string;
  IBGECode?: string;
  gradeBefore?: GradeSnapshot;
  gradeAfter?: GradeSnapshot;
  matchedCodes?: MatchedCode[];
  dimensions?: Record<string, DimensionScore>;
  overallScore: number;
  rationale?: string;
  projectId?: string | null;
};

export type MatchStep = {
  _id: string;
  key: string;
  kind: 'profile' | 'match';
  opportunityId: string;
  batchIndex: number;
  jobId?: string;
  status: string;
  error?: string;
  prompt?: string;
  request?: {
    method?: string;
    path?: string;
    query?: Record<string, string>;
    body?: { provider?: string; uri?: string };
  } | null;
  requestPayload?: unknown;
  rawResult?: unknown;
  profile?: unknown;
  countyIds?: string[];
  storageKey?: string;
  storageDriver?: string;
};

export type OpportunityMatchRun = {
  _id: string;
  opportunityIds: string[];
  opportunities?: { _id: string; name?: string }[];
  mode: MatchMode;
  status: MatchRunStatus;
  error?: string;
  candidateCount?: number;
  promptSnapshot?: Record<string, string>;
  scoreWeights?: Record<string, number>;
  steps: MatchStep[];
  matches: OpportunityCountyMatch[];
  createdAt?: string;
  updatedAt?: string;
  createdBy?: { _id?: string; username?: string; email?: string } | null;
};

export type OpportunityMatchesResponse = {
  latest: OpportunityMatchRun | null;
  history: OpportunityMatchRun[];
  scoreWeights: Record<string, number>;
};

export type OpportunityMatchRunsResponse = {
  items: OpportunityMatchRun[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPrev?: boolean;
    hasNext?: boolean;
  };
  sort?: { field: string; order: 'asc' | 'desc' };
  scoreWeights?: Record<string, number>;
};

export function isInFlightRun(status?: string | null) {
  const value = String(status || '').toLowerCase();
  return value === 'queued' || value === 'running';
}

export function formatGrade(snapshot?: GradeSnapshot) {
  if (!snapshot) return '—';
  const letter = snapshot.letter || '';
  const percent = snapshot.percent != null ? `${snapshot.percent}%` : '';
  const parts = [letter, percent].filter(Boolean);
  return parts.join(' ') || '—';
}

export function topCodes(match: OpportunityCountyMatch, limit = 3) {
  return (match.matchedCodes || [])
    .map((row) => row.code)
    .filter(Boolean)
    .slice(0, limit);
}

export function formatRunWhen(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function pickRun(history: OpportunityMatchRun[], runId?: string | null) {
  if (runId) {
    const match = history.find((row) => row._id === runId);
    if (match) return match;
  }
  return history[0] || null;
}
