/**
 * Opportunity–county correlation: prompt keys, score weights, and default RTCNAI prompts.
 * Keep in sync with client/lib/opportunityMatch.ts.
 */

const PROMPT_MAX = 8000;
const COUNTY_BATCH_SIZE = 20;
const RAW_RESULT_MAX = 50000;

const MATCH_MODES = ['shallow', 'deep'];
const RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'];
const STEP_STATUSES = ['pending', 'queued', 'running', 'succeeded', 'failed', 'cancelled'];
const IN_FLIGHT = new Set(['queued', 'running']);
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

const PROMPT_KEYS = {
  SHALLOW: 'opportunity_match_shallow',
  DEEP_PROFILE: 'opportunity_match_deep_profile',
  DEEP_COUNTIES: 'opportunity_match_deep_counties',
};

const PROMPT_LABELS = {
  [PROMPT_KEYS.SHALLOW]: 'Shallow match (one prompt)',
  [PROMPT_KEYS.DEEP_PROFILE]: 'Deep — opportunity profile',
  [PROMPT_KEYS.DEEP_COUNTIES]: 'Deep — county matching',
};

const DIMENSION_KEYS = [
  'gradeUplift',
  'localPlanPriority',
  'population',
  'economic',
  'capacity',
  'biome',
  'region',
  'riskReduction',
];

/** Weights sum to 100. Applied to 0–10 dimension scores → overall 0–100. */
const SCORE_WEIGHTS = {
  gradeUplift: 25,
  localPlanPriority: 20,
  population: 15,
  economic: 10,
  capacity: 10,
  biome: 8,
  region: 6,
  riskReduction: 6,
};

const JSON_OUTPUT_RULES = `Return ONLY valid JSON (no markdown fences, no commentary).
If a county is a poor fit, omit it or give it empty matchedCodes.
Never invent countyId, questionId, or code values that are not in the context document.
proposedScore must be a number in [0, maxPoints] for that question, or omitted.`;

const DEFAULT_PROMPTS = {
  [PROMPT_KEYS.SHALLOW]: `You correlate one funding opportunity with Brazilian counties that already have a diagnostic survey and/or a local plan.

Read the attached context document (JSON). It contains the opportunity catalog fields, summaries of analyzed opportunity documents, and compact county packs (survey grades/gaps, local-plan action codes with priorities, population, biome, region, economic and risk indicators).

For each county, decide which survey/local-plan codes this opportunity could realistically fund or improve. Prefer high-priority local-plan actions (higher technicalPriority and governmentPriority scores) and survey gaps (currentScore 0) that would raise the county grade.

Score biome, region, and riskReduction relevance from 0 (none) to 10 (very high) with a short note.

${JSON_OUTPUT_RULES}

Schema:
{
  "counties": [
    {
      "countyId": "string",
      "matchedCodes": [
        { "code": "string", "questionId": "string", "proposedScore": 0, "reason": "string" }
      ],
      "dimensions": {
        "biome": { "score": 0, "note": "string" },
        "region": { "score": 0, "note": "string" },
        "riskReduction": { "score": 0, "note": "string" }
      },
      "rationale": "string"
    }
  ]
}`,

  [PROMPT_KEYS.DEEP_PROFILE]: `You extract a structured profile of one funding opportunity from the attached context document (JSON). Use catalog fields and analyzed-document summaries only. Do not invent facts.

${JSON_OUTPUT_RULES}

Schema:
{
  "profile": {
    "summary": "string",
    "themes": ["string"],
    "eligibleAreas": ["string"],
    "likelyCodes": ["string"],
    "geoHints": ["string"],
    "restrictions": ["string"]
  }
}`,

  [PROMPT_KEYS.DEEP_COUNTIES]: `You match one funding opportunity (see opportunityProfile in the context) to counties that have a survey and/or local plan.

Read the attached context document (JSON). Prefer local-plan actions with higher technicalPriority and governmentPriority, and survey gaps (currentScore 0) that would improve the letter grade.

Score biome, region, and riskReduction relevance from 0 to 10.

${JSON_OUTPUT_RULES}

Schema:
{
  "counties": [
    {
      "countyId": "string",
      "matchedCodes": [
        { "code": "string", "questionId": "string", "proposedScore": 0, "reason": "string" }
      ],
      "dimensions": {
        "biome": { "score": 0, "note": "string" },
        "region": { "score": 0, "note": "string" },
        "riskReduction": { "score": 0, "note": "string" }
      },
      "rationale": "string"
    }
  ]
}`,
};

function clampPrompt(body) {
  return String(body || '').slice(0, PROMPT_MAX);
}

module.exports = {
  PROMPT_MAX,
  COUNTY_BATCH_SIZE,
  RAW_RESULT_MAX,
  MATCH_MODES,
  RUN_STATUSES,
  STEP_STATUSES,
  IN_FLIGHT,
  TERMINAL,
  PROMPT_KEYS,
  PROMPT_LABELS,
  DIMENSION_KEYS,
  SCORE_WEIGHTS,
  DEFAULT_PROMPTS,
  clampPrompt,
};
