const { computeScore } = require('./surveyInstrumentService');
const { SCORE_WEIGHTS, DIMENSION_KEYS } = require('../constants/opportunityMatch');
const { LEVEL_SCORE } = require('../constants/localPlan');

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function clamp10(value) {
  return Math.round(clamp(value, 0, 10) * 10) / 10;
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function extractJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.result != null && (value.response_format != null || value.responseFormat != null)) {
      return extractJson(value.result);
    }
    return value;
  }
  const raw = String(value || '').trim();
  if (!raw) {
    throw new Error('Analysis result was empty.');
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Analysis result did not contain JSON.');
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    throw new Error('Analysis result JSON was invalid.');
  }
}

function isGapAnswer(item, answersById) {
  if (item.type !== 'score') return false;
  const raw = answersById.get(String(item.questionId))?.value;
  const value = Number(raw);
  return !Number.isFinite(value) || value === 0;
}

function simulateGrade(versionItems, answers, matchedCodes) {
  const items = Array.isArray(versionItems) ? versionItems : [];
  const current = Array.isArray(answers) ? answers.map((row) => ({ ...row })) : [];
  const byId = new Map(current.map((row) => [String(row.questionId), row]));
  const itemById = new Map(items.map((item) => [String(item.questionId), item]));
  const itemByCode = new Map(items.map((item) => [String(item.code || '').toUpperCase(), item]));

  for (const match of matchedCodes || []) {
    const item =
      (match.questionId && itemById.get(String(match.questionId))) ||
      (match.code && itemByCode.get(String(match.code).toUpperCase()));
    if (!item || item.type !== 'score') continue;
    const maxPoints = Number(item.maxPoints) || 0;
    const proposed = Number(match.proposedScore);
    const nextValue = Number.isFinite(proposed)
      ? clamp(proposed, 0, maxPoints)
      : maxPoints;
    const existing = byId.get(String(item.questionId));
    if (existing) existing.value = nextValue;
    else {
      const row = { questionId: String(item.questionId), value: nextValue };
      current.push(row);
      byId.set(String(item.questionId), row);
    }
  }

  return {
    before: computeScore(items, answers || []),
    after: computeScore(items, current),
  };
}

function gradeUpliftScore(beforePercent, afterPercent) {
  const delta = Number(afterPercent || 0) - Number(beforePercent || 0);
  return clamp10((delta / 40) * 10);
}

function localPlanPriorityScore(matchedEntries) {
  const rows = Array.isArray(matchedEntries) ? matchedEntries : [];
  if (!rows.length) return 0;
  let total = 0;
  for (const row of rows) {
    const technical = Number(row.technicalPriority) || 0;
    const government = Number(row.governmentPriority) || 0;
    total += (technical / 8) * 10 * 0.6 + (government / 7) * 10 * 0.4;
  }
  return clamp10(total / rows.length);
}

function populationScore(population) {
  const pop = Number(population) || 0;
  if (pop <= 0) return 0;
  const log = Math.log10(pop);
  return clamp10(((log - 3) / 3.5) * 10);
}

function economicScore(gdp, maxGdp) {
  const value = Number(gdp) || 0;
  const cap = Number(maxGdp) || 0;
  if (value <= 0 || cap <= 0) return 0;
  return clamp10((Math.log10(value + 1) / Math.log10(cap + 1)) * 10);
}

function capacityScore(matchedEntries) {
  const rows = Array.isArray(matchedEntries) ? matchedEntries : [];
  if (!rows.length) return 5;
  let total = 0;
  for (const row of rows) {
    const consultant = row.consultant || {};
    const complexity = row.technical?.complexity || {};
    const capacity =
      ((LEVEL_SCORE[consultant.financialCapacity] ?? 1) +
        (LEVEL_SCORE[consultant.planCapacity] ?? 1) +
        (LEVEL_SCORE[consultant.interCooperation] ?? 1)) /
      3;
    const hard =
      ((LEVEL_SCORE[complexity.administrative] ?? 1) + (LEVEL_SCORE[complexity.financial] ?? 1)) / 2;
    total += clamp10(capacity * 5 - hard * 1.5 + 3);
  }
  return clamp10(total / rows.length);
}

function riskReductionScore(risk, aiScore) {
  const hidro = Number(risk?.hidroRisk) || 0;
  const disaster = Number(risk?.disasterRate) || 0;
  const people = Number(risk?.endangeredPeople) || 0;
  const raw = hidro * 0.4 + disaster * 0.4 + Math.min(people / 1000, 10) * 0.2;
  const deterministic = clamp10(raw);
  if (!Number.isFinite(Number(aiScore))) return deterministic;
  return clamp10(deterministic * 0.4 + Number(aiScore) * 0.6);
}

function blendAi(deterministic, aiScore) {
  if (!Number.isFinite(Number(aiScore))) return clamp10(deterministic);
  return clamp10(Number(deterministic) * 0.4 + Number(aiScore) * 0.6);
}

function overallScore(dimensions) {
  let total = 0;
  for (const key of DIMENSION_KEYS) {
    const weight = SCORE_WEIGHTS[key] || 0;
    const score = Number(dimensions?.[key]?.score) || 0;
    total += score * weight;
  }
  return Math.round(clamp(total / 10, 0, 100) * 10) / 10;
}

function emptyDimensions() {
  return Object.fromEntries(DIMENSION_KEYS.map((key) => [key, { score: 0, note: '' }]));
}

function buildDimensions({
  gradeBefore,
  gradeAfter,
  matchedEntries,
  population,
  gdp,
  maxGdp,
  risk,
  aiDimensions,
}) {
  const ai = aiDimensions || {};
  const dims = emptyDimensions();
  dims.gradeUplift = {
    score: gradeUpliftScore(gradeBefore?.percent, gradeAfter?.percent),
    note: `${gradeBefore?.letter || '—'} ${gradeBefore?.percent ?? '—'}% → ${gradeAfter?.letter || '—'} ${gradeAfter?.percent ?? '—'}%`,
  };
  dims.localPlanPriority = {
    score: localPlanPriorityScore(matchedEntries),
    note: matchedEntries?.length
      ? `Weighted priority of ${matchedEntries.length} matched action(s).`
      : 'No local-plan actions matched.',
  };
  dims.population = {
    score: populationScore(population),
    note: population ? `Population ${Number(population).toLocaleString('en-US')}` : 'Population unknown.',
  };
  dims.economic = {
    score: economicScore(gdp, maxGdp),
    note: gdp ? `PIB ${gdp}` : 'No PIB indicator.',
  };
  dims.capacity = {
    score: capacityScore(matchedEntries),
    note: 'Consultant capacity versus administrative/financial complexity.',
  };
  dims.biome = {
    score: clamp10(ai.biome?.score),
    note: String(ai.biome?.note || ''),
  };
  dims.region = {
    score: clamp10(ai.region?.score),
    note: String(ai.region?.note || ''),
  };
  dims.riskReduction = {
    score: riskReductionScore(risk, ai.riskReduction?.score),
    note: String(ai.riskReduction?.note || ''),
  };
  return dims;
}

module.exports = {
  clamp,
  clamp10,
  round1,
  extractJson,
  isGapAnswer,
  simulateGrade,
  gradeUpliftScore,
  localPlanPriorityScore,
  populationScore,
  economicScore,
  capacityScore,
  riskReductionScore,
  blendAi,
  overallScore,
  emptyDimensions,
  buildDimensions,
};
