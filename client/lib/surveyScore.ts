/**
 * Mirrors `computeScore` in `api/services/surveyInstrumentService.js`.
 * Only `type === 'score'` items contribute; yes/no, text, and choice are excluded.
 */

export type SurveyScore = {
  letter?: string;
  percent?: number;
  total?: number;
  maxTotal?: number;
  byArea?: Record<string, { total: number; maxTotal: number }>;
};

export type ScoreableQuestion = {
  questionId: string;
  type: string;
  area?: string;
  maxPoints?: number;
  weight?: number;
};

export type ScoreableAnswer = {
  questionId: string;
  value?: string | number;
};

export function letterGrade(percent: number) {
  if (percent >= 80) return 'A';
  if (percent >= 60) return 'B';
  if (percent >= 40) return 'C';
  if (percent >= 20) return 'D';
  return 'E';
}

export function computeSurveyScore(
  items: ScoreableQuestion[],
  answers: ScoreableAnswer[]
): SurveyScore {
  const byId = new Map((answers || []).map((row) => [String(row.questionId), row]));
  const byArea: Record<string, { total: number; maxTotal: number }> = {};
  let total = 0;
  let maxTotal = 0;

  for (const item of items || []) {
    if (item.type !== 'score') continue;
    const maxPoints = Number(item.maxPoints) || 0;
    const weight = Number(item.weight) || 0;
    const cap = maxPoints * weight;
    maxTotal += cap;
    const raw = byId.get(String(item.questionId))?.value;
    const value = Number(raw);
    const clamped = Number.isFinite(value) ? Math.min(maxPoints, Math.max(0, value)) : 0;
    const earned = clamped * weight;
    total += earned;
    const area = item.area || '—';
    if (!byArea[area]) byArea[area] = { total: 0, maxTotal: 0 };
    byArea[area].total += earned;
    byArea[area].maxTotal += cap;
  }

  const percent = maxTotal > 0 ? Math.round((total / maxTotal) * 1000) / 10 : 0;
  return {
    total,
    maxTotal,
    percent,
    letter: maxTotal > 0 ? letterGrade(percent) : '',
    byArea,
  };
}

export function formatScore(score?: SurveyScore) {
  if (!score) return '—';
  const parts: string[] = [];
  if (score.letter) parts.push(score.letter);
  if (score.percent != null) parts.push(`${score.percent}%`);
  if (score.total != null && score.maxTotal != null) {
    parts.push(`${score.total}/${score.maxTotal}`);
  }
  return parts.join(' · ') || '—';
}

export function formatAreaScore(score?: SurveyScore) {
  if (!score || !score.maxTotal) return '—';
  return formatScore(score);
}
