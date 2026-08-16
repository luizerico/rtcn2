const { ERROR_CODES } = require('../utils/httpErrors');
const { noteUpstreamRequest } = require('./upstreamRequestLog');
const { runSyncStage, fetchLabel } = require('./geoSyncDebug');

const IBGE_AGREGADOS_BASE = 'https://servicodados.ibge.gov.br/api/v3/agregados';
const FETCH_TIMEOUT_MS = 45_000;

function ibgeError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  error.code = status === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.INTERNAL;
  return error;
}

function isRetryable(error) {
  if (!error || error.status === 404) return false;
  return error.status === 502 || Boolean(error.cause);
}

function retryDelayMs(attempt) {
  return 400 * (attempt + 1);
}

async function fetchJsonOnce(url, timeoutMs) {
  noteUpstreamRequest(url);
  const label = fetchLabel(url);
  const text = await runSyncStage('fetch', label, async () => {
    let upstream;
    try {
      upstream = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const wrapped = ibgeError('IBGE agregados service is unreachable.');
      wrapped.cause = cause;
      throw wrapped;
    }

    const body = await upstream.text();
    if (upstream.status === 404) {
      throw ibgeError('IBGE aggregate not found.', 404);
    }
    if (!upstream.ok) {
      const snippet = String(body || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
      throw ibgeError(
        `IBGE agregados service returned ${upstream.status}${snippet ? `: ${snippet}` : '.'}`
      );
    }
    return body;
  });
  return runSyncStage('process', `parse ${label}`, () => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      throw ibgeError('IBGE agregados service returned invalid JSON.');
    }
  });
}

async function fetchJson(url, { timeoutMs = FETCH_TIMEOUT_MS, retries } = {}) {
  const maxRetries = retries ?? (process.env.NODE_ENV === 'test' ? 0 : 2);
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fetchJsonOnce(url, timeoutMs);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
    }
  }
  throw lastError;
}

function parsePeriodId(value) {
  const match = String(value || '').match(/\d{4}/);
  return match ? match[0] : '';
}

async function getAggregateMetadata(aggregateId) {
  const data = await fetchJson(`${IBGE_AGREGADOS_BASE}/${encodeURIComponent(aggregateId)}/metadados`);
  const fim = parsePeriodId(data?.periodicidade?.fim);
  const inicio = parsePeriodId(data?.periodicidade?.inicio);
  const niveis = data?.nivelTerritorial?.Administrativo || [];
  return {
    id: data?.id,
    nome: data?.nome,
    inicio,
    fim,
    niveis: niveis.map((item) => String(item).toUpperCase()),
    raw: data,
  };
}

async function listAggregatePeriods(aggregateId) {
  const data = await fetchJson(`${IBGE_AGREGADOS_BASE}/${encodeURIComponent(aggregateId)}/periodos`);
  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => parsePeriodId(row?.id || row?.nome || row))
    .filter(Boolean)
    .sort();
}

function normalizeClassificacao(value) {
  if (!value) return '';
  // SIDRA accepts `|` between classification groups, but category lists inside
  // brackets must be comma-separated. Pipes inside `[]` make the API return 500.
  return String(value).replace(/\[([^\]]*)\]/g, (_, inner) => `[${inner.replace(/\|/g, ',')}]`);
}

function buildValuesUrl({
  aggregateId,
  periods,
  variables,
  localidades,
  classificacao,
}) {
  const periodPart = Array.isArray(periods) ? periods.join('|') : String(periods);
  const variablePart = Array.isArray(variables) ? variables.join('|') : String(variables);
  const params = new URLSearchParams();
  params.set('localidades', localidades);
  const classif = normalizeClassificacao(classificacao);
  if (classif) params.set('classificacao', classif);
  return `${IBGE_AGREGADOS_BASE}/${encodeURIComponent(aggregateId)}/periodos/${encodeURIComponent(
    periodPart
  )}/variaveis/${encodeURIComponent(variablePart)}?${params}`;
}

function parseNumeric(value) {
  if (value == null) return null;
  const raw = String(value).trim().replace(',', '.');
  if (!raw || raw === '-' || raw === '..' || raw === '...' || raw === 'X' || raw === 'x') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function impactYearFromClassificacoes(classificacoes) {
  if (!Array.isArray(classificacoes)) return null;
  for (const entry of classificacoes) {
    if (String(entry?.id || '') !== '1210') continue;
    const categoria = entry?.categoria;
    if (!categoria || typeof categoria !== 'object') continue;
    const [categoryId, category] = Object.entries(categoria)[0] || [];
    const year = Number(parsePeriodId(category) || parsePeriodId(categoryId));
    return Number.isFinite(year) && year ? year : null;
  }
  return null;
}
const SKIP_CLASSIFICATION_IDS = new Set(['1210']);
const PREFERRED_CLASSIFICATION_IDS = new Set(['12446', '782']);

function categoryFromClassificacoes(classificacoes) {
  if (!Array.isArray(classificacoes) || !classificacoes.length) {
    return { categoryId: '', category: '' };
  }
  let preferred = null;
  let fallback = null;
  for (const entry of classificacoes) {
    const classId = String(entry?.id || '');
    if (SKIP_CLASSIFICATION_IDS.has(classId)) continue;
    const categoria = entry?.categoria;
    if (!categoria || typeof categoria !== 'object') continue;
    const [categoryId, category] = Object.entries(categoria)[0] || [];
    if (categoryId == null) continue;
    const parsed = { categoryId: String(categoryId), category: String(category || '') };
    if (PREFERRED_CLASSIFICATION_IDS.has(classId) && !preferred) preferred = parsed;
    else if (!fallback) fallback = parsed;
  }
  return preferred || fallback || { categoryId: '', category: '' };
}

function flattenValues(payload) {
  const rows = [];
  if (!Array.isArray(payload)) return rows;

  for (const variable of payload) {
    const seriesId = String(variable?.id || '');
    const unit = String(variable?.unidade || '');
    const resultados = Array.isArray(variable?.resultados) ? variable.resultados : [];
    for (const resultado of resultados) {
      const { categoryId, category } = categoryFromClassificacoes(resultado?.classificacoes);
      const impactYear = impactYearFromClassificacoes(resultado?.classificacoes);
      const series = Array.isArray(resultado?.series) ? resultado.series : [];
      for (const item of series) {
        const nivelId = item?.localidade?.nivel?.id;
        const ibgeId = String(item?.localidade?.id || '').trim();
        const values = item?.serie && typeof item.serie === 'object' ? item.serie : {};
        for (const [yearKey, rawValue] of Object.entries(values)) {
          const year = Number(parsePeriodId(yearKey));
          const value = parseNumeric(rawValue);
          if (!ibgeId || !year || value == null) continue;
          rows.push({
            variableId: seriesId,
            unit,
            categoryId,
            category,
            impactYear,
            nivelId: String(nivelId || '').toUpperCase(),
            ibgeId,
            year,
            value,
          });
        }
      }
    }
  }
  return rows;
}

async function fetchAggregateValues(options) {
  const url = buildValuesUrl(options);
  const payload = await fetchJson(url);
  return runSyncStage('process', `flatten ${fetchLabel(url)}`, () => flattenValues(payload));
}

function lastNPeriods(periods, n = 5) {
  return periods.slice(-n);
}

function periodsAfter(periods, originPeriod) {
  const origin = Number(originPeriod);
  if (!Number.isFinite(origin)) return periods;
  return periods.filter((period) => Number(period) > origin);
}

module.exports = {
  IBGE_AGREGADOS_BASE,
  fetchJson,
  getAggregateMetadata,
  listAggregatePeriods,
  buildValuesUrl,
  flattenValues,
  fetchAggregateValues,
  lastNPeriods,
  periodsAfter,
  parsePeriodId,
  parseNumeric,
  impactYearFromClassificacoes,
  normalizeClassificacao,
};
