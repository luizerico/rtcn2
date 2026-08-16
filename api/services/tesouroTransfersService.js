const { normalizeMunicipioIbgeId, UF_TO_IBGE_ID } = require('./ibgeLocalidades');
const { noteUpstreamRequest } = require('./upstreamRequestLog');
const { runSyncStage, fetchLabel, noteSyncError, logSyncConsole } = require('./geoSyncDebug');

const TRANSFERS_BASE = 'https://apiapex.tesouro.gov.br/aria/v1/transferencias_constitucionais/custom';
const FETCH_TIMEOUT_MS = 20_000;
const MUNICIPAL_PAGE_SIZE = 2000;
const MAX_PAGES = 20;
const COUNTY_YEAR_WINDOW = 2;
const WANTED_TYPES = [
  { id: 'fpm', pattern: /\bfpm\b|fundo de participacao dos municipios/i, sphere: 'county' },
  { id: 'fpe', pattern: /\bfpe\b|fundo de participacao dos estados/i, sphere: 'state' },
  { id: 'fundeb', pattern: /\bfundeb\b/i, sphere: 'county' },
  { id: 'itr', pattern: /\bitr\b|imposto territorial rural/i, sphere: 'county' },
];

function transfersError(message, status = 502) {
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
      const wrapped = transfersError('Tesouro transfers service is unreachable.');
      wrapped.cause = cause;
      throw wrapped;
    }
    const text = await upstream.text();
    if (!upstream.ok) {
      throw transfersError('Tesouro transfers service returned an error.');
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw transfersError('Tesouro transfers service returned invalid JSON.');
    }
  });
}

async function fetchJson(url, { retries } = {}) {
  const maxRetries = retries ?? (process.env.NODE_ENV === 'test' ? 0 : 1);
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

function itemsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.registros)) return payload.registros;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.items?.items)) return payload.items.items;
  return [];
}

function nextPageUrl(payload) {
  const raw = payload?.next;
  if (!raw) return '';
  return String(raw).replace('aria//', 'aria/').trim();
}

async function fetchAllRegistros(url) {
  const all = [];
  let next = url;
  const seen = new Set();
  while (next && !seen.has(next) && seen.size < MAX_PAGES) {
    seen.add(next);
    const payload = await fetchJson(next);
    const page = itemsOf(payload);
    all.push(...page);
    const following = nextPageUrl(payload);
    if (!following || following === next || !page.length) break;
    next = following;
  }
  return all;
}

async function listTransferTypes() {
  return fetchAllRegistros(`${TRANSFERS_BASE}/transferencias`);
}

async function listTreasuryStates() {
  try {
    return (await fetchAllRegistros(`${TRANSFERS_BASE}/estados`))
      .map((row) => ({
        codigo: String(row.codigo ?? row.id ?? '').trim(),
        nome: String(row.nome || '').trim(),
      }))
      .filter((row) => row.codigo);
  } catch (error) {
    noteSyncError(error, error?.stage || 'fetch', 'Tesouro transfer state catalog');
    logSyncConsole('Tesouro transfer state catalog fetch failed', error);
    return [];
  }
}

function matchWantedTypes(catalog) {
  const matched = [];
  for (const wanted of WANTED_TYPES) {
    const row = catalog.find((item) =>
      wanted.pattern.test(String(item?.transferencia || item?.nome || item?.descricao || ''))
    );
    if (!row) continue;
    matched.push({
      ...wanted,
      codigo: String(row.codigo ?? row.id ?? row.p_transferencia ?? ''),
      label: String(row.transferencia || row.nome || wanted.id).trim(),
    });
  }
  return matched.filter((item) => item.codigo);
}

async function probeTransfers(maxYears = 5) {
  const catalog = await listTransferTypes();
  const types = matchWantedTypes(catalog);
  if (!types.length) {
    throw transfersError('Tesouro transfer type catalog did not include FPM/FPE/FUNDEB/ITR.');
  }
  const now = new Date().getFullYear();
  const latestYear = now - 1;
  const years = [];
  for (let year = latestYear; year > latestYear - maxYears; year -= 1) years.push(year);
  return {
    originPeriod: String(latestYear),
    originFingerprint: `transfers:${types.map((item) => item.codigo).join(',')}:${latestYear}`,
    latestYear,
    years,
    types,
  };
}

function parseAmount(row) {
  const raw = row?.VALOR ?? row?.valor ?? row?.vl_valor ?? row?.valor_transferido;
  if (raw == null || raw === '') return null;
  const num = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function enteFromRow(row, sphere) {
  const raw = row?.CO_IBGE || row?.co_ibge || row?.cod_ibge || row?.codigo_ibge || row?.id_ente || '';
  const digits = String(raw).replace(/\D/g, '');
  if (sphere === 'county' && digits.length >= 7) {
    return { kind: 'county', ibgeId: normalizeMunicipioIbgeId(digits) };
  }
  if (sphere === 'state') {
    const ufLetter = String(row?.uf || row?.UF || '').toUpperCase();
    if (ufLetter.length === 2 && UF_TO_IBGE_ID[ufLetter]) {
      return { kind: 'state', ibgeId: UF_TO_IBGE_ID[ufLetter] };
    }
    const uf = digits.length >= 2 ? digits.slice(0, 2) : digits;
    if (uf.length === 2) return { kind: 'state', ibgeId: uf };
  }
  if (digits.length === 2) return { kind: 'state', ibgeId: digits };
  if (digits.length >= 7) return { kind: 'county', ibgeId: normalizeMunicipioIbgeId(digits) };
  return null;
}

function filterStatesForCatalog(states, maps) {
  if (!maps?.states?.length) return states;
  const names = new Set(
    maps.states.map((row) =>
      String(row.name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
    )
  );
  const ufs = new Set(maps.states.map((row) => String(row.code || '').toUpperCase()));
  const matched = states.filter((row) => {
    const nome = String(row.nome || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const uf = String(row.uf || row.sigla || row.codigo_uf || '').toUpperCase();
    return (uf.length === 2 && ufs.has(uf)) || names.has(nome);
  });
  return matched.length ? matched : states;
}

async function fetchTypeYear(type, year, states) {
  if (type.sphere === 'state') {
    const params = new URLSearchParams({
      p_ano: String(year),
      p_transferencia: String(type.codigo),
    });
    return fetchAllRegistros(`${TRANSFERS_BASE}/por_estados?${params}`);
  }

  if (states?.length) {
    const rows = [];
    for (const state of states) {
      const params = new URLSearchParams({
        p_estado: String(state.codigo),
        p_ano: String(year),
        p_transferencia: String(type.codigo),
        pageSize: String(MUNICIPAL_PAGE_SIZE),
      });
      rows.push(...(await fetchAllRegistros(`${TRANSFERS_BASE}/por_estado_municipio?${params}`)));
    }
    return rows;
  }

  const params = new URLSearchParams({
    p_ano: String(year),
    p_transferencia: String(type.codigo),
  });
  return fetchAllRegistros(`${TRANSFERS_BASE}/por_municipio?${params}`);
}

function mapTransferRows(items, type, year, maps, fetchedAt) {
  const totals = new Map();
  for (const row of items) {
    const ente = enteFromRow(row, type.sphere);
    if (!ente) continue;
    const value = parseAmount(row);
    if (value == null) continue;
    const rowYear = Number(row?.ANO || row?.ano || row?.an_exercicio || year);
    const key = `${ente.kind}|${ente.ibgeId}|${rowYear}`;
    totals.set(key, (totals.get(key) || 0) + value);
  }

  const docs = [];
  for (const [key, value] of totals) {
    const [kind, ibgeId, rowYear] = key.split('|');
    const subject =
      kind === 'county' ? maps.countyByIbge.get(ibgeId) : maps.stateByIbge.get(ibgeId);
    if (!subject) continue;
    docs.push({
      kind,
      subjectId: subject._id,
      ibgeId,
      source: 'transfers',
      series: type.id,
      year: Number(rowYear),
      value,
      unit: 'R$',
      categoryId: type.id,
      category: type.label || type.id.toUpperCase(),
      fetchedAt,
    });
  }
  return docs;
}

async function collectTransferDocs({ years, types, maps, fetchedAt, onBatch }) {
  const docs = [];
  let failed = 0;
  const catalog = types || matchWantedTypes(await listTransferTypes());
  const stateTypes = catalog.filter((type) => type.sphere === 'state');
  const countyTypes = catalog.filter((type) => type.sphere === 'county');
  const states = countyTypes.length
    ? filterStatesForCatalog(await listTreasuryStates(), maps)
    : [];
  const countyYears = years.slice(0, COUNTY_YEAR_WINDOW);

  async function pull(type, year, subset) {
    try {
      const items = await fetchTypeYear(type, year, subset);
      const mapped = await runSyncStage('process', `map ${type.id} ${year}`, () =>
        mapTransferRows(items, type, year, maps, fetchedAt)
      );
      docs.push(...mapped);
      if (onBatch) await onBatch(mapped);
    } catch (error) {
      failed += 1;
      noteSyncError(error, error?.stage || 'fetch', `Tesouro ${type.id} ${year}`);
      logSyncConsole(`Tesouro transfer ${type.id} ${year} fetch failed`, error);
    }
  }

  for (const year of years) {
    for (const type of stateTypes) {
      await pull(type, year);
    }
  }
  for (const year of countyYears) {
    for (const type of countyTypes) {
      await pull(type, year, states);
    }
  }
  return { docs, failed };
}

module.exports = {
  TRANSFERS_BASE,
  WANTED_TYPES,
  probeTransfers,
  collectTransferDocs,
  matchWantedTypes,
  mapTransferRows,
};
