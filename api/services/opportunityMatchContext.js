const StoredFile = require('../models/StoredFile');
const Opportunity = require('../models/assets/Opportunity');
const LocalPlan = require('../models/assets/LocalPlan');
const Survey = require('../models/assets/Survey');
const { InstrumentResponse, InstrumentVersion } = require('../models/survey');
const { County, CountyStatus, GeoIndicator } = require('../models/geo');
const { activeFilter } = require('./trash');
const { isGapAnswer } = require('./opportunityMatchScore');
const { parseAnalysisResult } = require('./rtcnaiService');
const { HttpError, ERROR_CODES } = require('../utils/httpErrors');
const { ValidationError } = require('../validation');

function idStr(value) {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

function nameOf(ref) {
  if (!ref || typeof ref !== 'object') return '';
  return ref.name || '';
}

function latestYearly(rows) {
  const list = Array.isArray(rows) ? rows.filter((row) => row && row.value != null) : [];
  if (!list.length) return null;
  list.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  return { value: Number(list[0].value) || 0, year: list[0].year || null };
}

function compactEntry(entry) {
  return {
    questionId: String(entry.questionId),
    code: entry.code || '',
    area: entry.area || '',
    todo: entry.todo || '',
    technicalPriority: entry.technicalPriority?.score ?? null,
    governmentPriority: entry.governmentPriority?.score ?? null,
    technical: {
      complexity: entry.technical?.complexity || {},
      isMandatory: Boolean(entry.technical?.isMandatory),
    },
    consultant: entry.consultant || {},
  };
}

function compactGaps(items, answers) {
  const byId = new Map((answers || []).map((row) => [String(row.questionId), row]));
  return (items || [])
    .filter((item) => isGapAnswer(item, byId))
    .map((item) => ({
      questionId: String(item.questionId),
      code: item.code || '',
      area: item.area || '',
      todo: item.todo || item.prompt || '',
      maxPoints: Number(item.maxPoints) || 0,
      weight: Number(item.weight) || 0,
      currentScore: 0,
    }));
}

async function loadOpportunityContext(opportunityId) {
  const doc = await Opportunity.findOne(activeFilter({ _id: opportunityId })).populate(
    'sponsor',
    'name origem'
  );
  if (!doc) {
    throw new HttpError(404, 'Opportunity not found.', { code: ERROR_CODES.NOT_FOUND });
  }
  const files = await StoredFile.find(
    activeFilter({ ownerType: 'opportunity', ownerId: doc._id })
  )
    .select('displayName analysis.result analysis.status')
    .sort({ updatedAt: -1 })
    .lean();
  const documentSummaries = files
    .filter((file) => file.analysis?.status === 'succeeded' && file.analysis?.result)
    .map((file) => ({
      name: file.displayName,
      summary: parseAnalysisResult(file.analysis.result),
    }));

  return {
    opportunity: {
      _id: String(doc._id),
      name: doc.name,
      description: doc.description || '',
      type: doc.type,
      category: doc.category,
      eligibility: doc.eligibility,
      website: doc.website,
      submissionMethod: doc.submissionMethod,
      startDate: doc.startDate,
      endDate: doc.endDate || null,
      continuous: Boolean(doc.continuous),
      budget: doc.budget,
      totalBudget: doc.totalBudget || null,
      currency: doc.currency,
      obs: doc.obs || [],
      sponsor: nameOf(doc.sponsor),
    },
    documentSummaries,
    record: doc,
  };
}

async function loadCandidateCounties() {
  const [responses, plans] = await Promise.all([
    InstrumentResponse.find(
      activeFilter({ subjectType: 'COUNTY', status: 'approved' })
    )
      .select(
        'instrumentId instrumentVersionId subjectId computedScore answers status updatedAt'
      )
      .sort({ updatedAt: -1 })
      .lean(),
    LocalPlan.find(activeFilter({}))
      .select('name status countyId surveyId entries updatedAt')
      .sort({ status: 1, updatedAt: -1 })
      .lean(),
  ]);

  const countyIds = new Set();
  for (const row of responses) countyIds.add(idStr(row.subjectId));
  for (const row of plans) countyIds.add(idStr(row.countyId));
  if (!countyIds.size) {
    throw new ValidationError('No counties with an approved survey or a local plan were found.');
  }

  const ids = [...countyIds];
  const [counties, statuses, indicators, versions, surveys] = await Promise.all([
    County.find({ _id: { $in: ids }, isDeleted: { $ne: true } })
      .populate('biome', 'code name')
      .populate('region', 'code name')
      .populate('state', 'code name')
      .lean(),
    CountyStatus.find({ county: { $in: ids }, isDeleted: { $ne: true } }).lean(),
    GeoIndicator.find({
      kind: 'county',
      subjectId: { $in: ids },
      source: 'pib',
      series: { $in: ['gdp', 'vab_total'] },
    })
      .select('subjectId series year value unit')
      .sort({ year: -1 })
      .lean(),
    InstrumentVersion.find({
      _id: { $in: [...new Set(responses.map((row) => idStr(row.instrumentVersionId)).filter(Boolean))] },
    }).lean(),
    Survey.find({
      _id: { $in: [...new Set(responses.map((row) => idStr(row.instrumentId)).filter(Boolean))] },
    })
      .select('name')
      .lean(),
  ]);

  const versionById = new Map(versions.map((row) => [String(row._id), row]));
  const surveyById = new Map(surveys.map((row) => [String(row._id), row]));
  const statusByCounty = new Map(statuses.map((row) => [idStr(row.county), row]));
  const pibByCounty = new Map();
  for (const row of indicators) {
    const key = idStr(row.subjectId);
    const current = pibByCounty.get(key);
    if (!current || (row.series === 'gdp' && current.series !== 'gdp') || row.year > current.year) {
      if (!current || row.year > current.year || (row.series === 'gdp' && current.series !== 'gdp' && row.year >= current.year)) {
        pibByCounty.set(key, row);
      }
    }
  }

  const responsesByCounty = new Map();
  for (const row of responses) {
    const key = idStr(row.subjectId);
    if (!responsesByCounty.has(key)) responsesByCounty.set(key, []);
    responsesByCounty.get(key).push(row);
  }
  const plansByCounty = new Map();
  for (const row of plans) {
    const key = idStr(row.countyId);
    if (!plansByCounty.has(key)) plansByCounty.set(key, []);
    plansByCounty.get(key).push(row);
  }

  let maxGdp = 0;
  const packs = [];
  const byCountyId = new Map();

  for (const county of counties) {
    const cid = String(county._id);
    const countyResponses = responsesByCounty.get(cid) || [];
    const countyPlans = plansByCounty.get(cid) || [];
    const defaultPlans = countyPlans.filter((row) => row.status === 'default');
    const plansToUse = defaultPlans.length ? defaultPlans : countyPlans.slice(0, 2);
    const status = statusByCounty.get(cid);
    const hidro = latestYearly(status?.hidroRisk);
    const disaster = latestYearly(status?.disasterRate);
    const endangered = latestYearly(
      (status?.endangeredPeople || []).map((row) => ({ value: row.value, year: row.year }))
    );
    const pib = pibByCounty.get(cid);
    const gdp = pib ? Number(pib.value) || 0 : 0;
    if (gdp > maxGdp) maxGdp = gdp;

    const surveysPack = countyResponses.slice(0, 3).map((response) => {
      const version = versionById.get(idStr(response.instrumentVersionId));
      const survey = surveyById.get(idStr(response.instrumentId));
      const score = response.computedScore || {};
      return {
        surveyId: idStr(response.instrumentId),
        surveyName: survey?.name || '',
        responseId: String(response._id),
        letter: score.letter || '',
        percent: score.percent ?? null,
        total: score.total ?? null,
        maxTotal: score.maxTotal ?? null,
        byArea: score.byArea || {},
        gaps: compactGaps(version?.items, response.answers),
        _versionItems: version?.items || [],
        _answers: response.answers || [],
      };
    });

    const localPlansPack = plansToUse.map((plan) => ({
      localPlanId: String(plan._id),
      surveyId: idStr(plan.surveyId),
      name: plan.name,
      status: plan.status,
      entries: (plan.entries || []).map(compactEntry),
    }));

    const pack = {
      countyId: cid,
      name: county.name,
      IBGECode: county.IBGECode || '',
      population: county.population || null,
      biome: county.biome ? { code: county.biome.code, name: county.biome.name } : null,
      region: county.region ? { code: county.region.code, name: county.region.name } : null,
      state: county.state ? { code: county.state.code, name: county.state.name } : null,
      surveys: surveysPack.map((row) => {
        const { _versionItems, _answers, ...rest } = row;
        return rest;
      }),
      localPlans: localPlansPack,
      economic: pib
        ? { series: pib.series, year: pib.year, value: pib.value, unit: pib.unit || '' }
        : null,
      risk: {
        hidroRisk: hidro?.value ?? null,
        disasterRate: disaster?.value ?? null,
        endangeredPeople: endangered?.value ?? null,
      },
    };

    packs.push(pack);
    byCountyId.set(cid, {
      pack,
      surveys: surveysPack,
      localPlans: localPlansPack,
      population: county.population || 0,
      gdp,
      risk: pack.risk,
    });
  }

  packs.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { counties: packs, byCountyId, maxGdp };
}

module.exports = {
  idStr,
  loadOpportunityContext,
  loadCandidateCounties,
};
