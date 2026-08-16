const { normalizeMunicipioIbgeId } = require('./ibgeLocalidades');
const { noteUpstreamRequest } = require('./upstreamRequestLog');
const { runSyncStage, fetchLabel, noteSyncError, logSyncConsole } = require('./geoSyncDebug');

const SICONFI_BASE = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt';
const PAGE_SIZE = 5000;
const FETCH_TIMEOUT_MS = 60_000;
const ANNEX_REVENUE = 'DCA-Anexo I-C';
const ANNEX_EXPENSE = 'DCA-Anexo I-D';
const PROBE_ENTES = ['35', '52', '33', '31', '41'];
const COUNTY_YEAR_WINDOW = 2;

function siconfiError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isRetryable(error) {
  return Boolean(error?.cause) || error?.status === 502;
}

function retryDelayMs(attempt) {
  return 400 * (attempt + 1);
}

async function fetchJsonOnce(url) {
  noteUpstreamRequest(url);
  return runSyncStage('fetch', fetchLabel(url), async () => {
    let upstream;
    try {
      upstream = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (cause) {
      const wrapped = siconfiError('STN SICONFI service is unreachable.');
      wrapped.cause = cause;
      throw wrapped;
    }
    const text = await upstream.text();
    if (!upstream.ok) {
      throw siconfiError('STN SICONFI service returned an error.');
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw siconfiError('STN SICONFI service returned invalid JSON.');
    }
  });
}

async function fetchJson(url, { retries } = {}) {
  const maxRetries = retries ?? (process.env.NODE_ENV === 'test' ? 0 : 2);
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fetchJsonOnce(url);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
    }
  }
  throw lastError;
}

function buildDcaUrl({ year, anexo, offset = 0, limit = PAGE_SIZE, idEnte }) {
  const params = new URLSearchParams();
  params.set('an_exercicio', String(year));
  params.set('no_anexo', anexo);
  params.set('offset', String(offset));
  params.set('limit', String(limit));
  if (idEnte) params.set('id_ente', String(idEnte));
  return `${SICONFI_BASE}/dca?${params}`;
}

async function fetchDcaPages({ year, anexo, idEnte }) {
  const items = [];
  let offset = 0;
  for (;;) {
    const payload = await fetchJson(buildDcaUrl({ year, anexo, offset, idEnte }));
    const page = Array.isArray(payload?.items) ? payload.items : [];
    items.push(...page);
    if (!payload?.hasMore || !page.length) break;
    offset += page.length;
  }
  return items;
}

function candidateYears(maxYears = 5) {
  const now = new Date().getFullYear();
  const latestLikely = now - 1;
  const years = [];
  for (let year = latestLikely; year >= latestLikely - (maxYears + 1); year -= 1) years.push(year);
  return years;
}

async function probeSiconfi(maxYears = 5) {
  const years = candidateYears(maxYears);
  for (const year of years) {
    for (const idEnte of PROBE_ENTES) {
      try {
        const payload = await fetchJson(
          buildDcaUrl({ year, anexo: ANNEX_REVENUE, offset: 0, limit: 1, idEnte })
        );
        if (Array.isArray(payload?.items) && payload.items.length) {
          return {
            originPeriod: String(year),
            originFingerprint: `siconfi:dca:${year}`,
            latestYear: year,
            years: years.filter((item) => item <= year).slice(0, maxYears),
          };
        }
      } catch (error) {
        console.error(`SICONFI probe ${year} ente ${idEnte} failed`, error);
      }
    }
  }
  throw siconfiError('SICONFI DCA has no published annual accounts in the recent window.');
}

function enteFromRow(row) {
  const raw = row?.cod_ibge || row?.id_ente || row?.codigo_ibge || row?.cod_ibge7 || '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length >= 7) return { kind: 'county', ibgeId: normalizeMunicipioIbgeId(digits) };
  if (digits.length === 2) return { kind: 'state', ibgeId: digits };
  return null;
}

function accountDigits(row) {
  return String(row?.cod_conta || row?.conta_contabil || '').replace(/\D/g, '');
}

function accountLabel(row) {
  return String(row?.conta || row?.ds_conta || row?.descricao || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function columnLabel(row) {
  return String(row?.coluna || row?.coluna_valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseAmount(row) {
  const raw = row?.valor ?? row?.vl_valor ?? row?.valor_coluna;
  if (raw == null || raw === '') return null;
  const num = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function isAggregateTotal(digits, label) {
  if (/^total/.test(label) || /receitas totais|total das receitas|despesas totais|total das despesas/.test(label)) {
    return true;
  }
  if (/receitas \(exceto intra|despesas \(exceto intra/.test(label)) return true;
  return /^[13]0+$/.test(digits) || digits === '1' || digits === '3';
}

function mapRevenueSeries(row) {
  const coluna = columnLabel(row);
  if (coluna && !/realiz/.test(coluna)) return null;
  const digits = accountDigits(row);
  const label = accountLabel(row);
  if (/^17/.test(digits) || /transferencias correntes/.test(label)) return 'revenue_transfers';
  if (isAggregateTotal(digits, label) && (/^1/.test(digits) || /receita/.test(label))) return 'revenue_total';
  if (!digits && /total/.test(label) && /receita/.test(label)) return 'revenue_total';
  return null;
}

function mapExpenseSeries(row) {
  const coluna = columnLabel(row);
  const digits = accountDigits(row);
  const label = accountLabel(row);
  const personnel = /^31/.test(digits) || /pessoal e encargos|despesas com pessoal/.test(label);
  const total = isAggregateTotal(digits, label) && (/^3/.test(digits) || /despesa/.test(label));
  if (!personnel && !total && !/total/.test(label)) return null;
  if (personnel) {
    if (/paga/.test(coluna) || /empenhad/.test(coluna) || !coluna) return 'expense_personnel';
    return null;
  }
  if (/paga/.test(coluna)) return 'expense_paid';
  if (/empenhad/.test(coluna) || !coluna) return 'expense_committed';
  return null;
}

function mapDcaRows(items, anexo, year, maps, fetchedAt) {
  const mapper = anexo === ANNEX_EXPENSE ? mapExpenseSeries : mapRevenueSeries;
  const docs = [];
  for (const row of items) {
    const ente = enteFromRow(row);
    if (!ente) continue;
    const series = mapper(row);
    if (!series) continue;
    const value = parseAmount(row);
    if (value == null) continue;
    const subject =
      ente.kind === 'county' ? maps.countyByIbge.get(ente.ibgeId) : maps.stateByIbge.get(ente.ibgeId);
    if (!subject) continue;
    docs.push({
      kind: ente.kind,
      subjectId: subject._id,
      ibgeId: ente.ibgeId,
      source: 'siconfi',
      series,
      year: Number(row?.exercicio || row?.an_exercicio || year),
      value,
      unit: 'R$',
      categoryId: '',
      category: '',
      fetchedAt,
    });
  }
  return docs;
}

function catalogEnteIds(maps) {
  const states = [...(maps.stateByIbge?.keys() || [])].filter((id) => /^\d{2}$/.test(String(id)));
  const counties = [...(maps.countyByIbge?.keys() || [])];
  return { states, counties };
}

async function collectSiconfiDocs({ years, maps, fetchedAt }) {
  const docs = [];
  let failed = 0;
  const { states, counties } = catalogEnteIds(maps);
  const countyYears = years.slice(0, COUNTY_YEAR_WINDOW);

  async function pull(year, anexo, idEnte) {
    try {
      const items = await fetchDcaPages({ year, anexo, idEnte });
      docs.push(
        ...(await runSyncStage('process', `map ${anexo} ${year} ente ${idEnte}`, () =>
          mapDcaRows(items, anexo, year, maps, fetchedAt)
        ))
      );
    } catch (error) {
      failed += 1;
      noteSyncError(error, error?.stage || 'fetch', `SICONFI ${anexo} ${year} ente ${idEnte}`);
      logSyncConsole(`SICONFI ${anexo} ${year} ente ${idEnte} fetch failed`, error);
    }
  }

  for (const year of years) {
    for (const anexo of [ANNEX_REVENUE, ANNEX_EXPENSE]) {
      for (const idEnte of states) {
        await pull(year, anexo, idEnte);
      }
    }
  }
  for (const year of countyYears) {
    for (const anexo of [ANNEX_REVENUE, ANNEX_EXPENSE]) {
      for (const idEnte of counties) {
        await pull(year, anexo, idEnte);
      }
    }
  }
  return { docs, failed };
}

module.exports = {
  SICONFI_BASE,
  ANNEX_REVENUE,
  ANNEX_EXPENSE,
  probeSiconfi,
  collectSiconfiDocs,
  mapDcaRows,
  mapRevenueSeries,
  mapExpenseSeries,
};
