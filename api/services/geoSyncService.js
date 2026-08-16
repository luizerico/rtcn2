const {
  Region,
  State,
  County,
  GeoIndicator,
  GeoDisaster,
  GeoAmendment,
  GeoSyncState,
  GeoMalha,
} = require('../models/geo');
const {
  getAggregateMetadata,
  listAggregatePeriods,
  fetchAggregateValues,
  lastNPeriods,
  periodsAfter,
} = require('./ibgeAgregados');
const {
  REGION_LETTER_TO_IBGE_ID,
  UF_TO_IBGE_ID,
  nivelToKind,
  normalizeMunicipioIbgeId,
} = require('./ibgeLocalidades');
const { SOURCE_CATALOG, getSource } = require('./geoSourceCatalog');
const { probeSiconfi, collectSiconfiDocs } = require('./siconfiService');
const { probeTransfers, collectTransferDocs } = require('./tesouroTransfersService');
const { probeEmendas, collectEmendaDocs } = require('./emendasService');
const { recordAction } = require('./actionLogService');
const { noteUpstreamRequest, withUpstreamRequestLog, requestLogMeta } = require('./upstreamRequestLog');
const {
  runSyncStage,
  fetchLabel,
  noteSyncError,
  logSyncConsole,
  withSyncDebug,
} = require('./geoSyncDebug');

function malhasController() {
  return require('../controllers/malhasController');
}

const S2ID_PACKAGE_URL = 'https://dadosabertos.mdr.gov.br/api/3/action/package_show?id=s2id_sedec';
const S2ID_CSV_TIMEOUT_MS = 120_000;
const S2ID_FETCH_HEADERS = {
  Accept: 'application/json, text/csv, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (compatible; RTCN-geo-sync/1.0; +https://github.com/luizerico/rtcn2)',
};
const MUNIC_DISASTER_META = {
  flood: { typeLabel: 'Floods (gradual)', cobrade: '1.2.1' },
  flash_flood: { typeLabel: 'Flash floods', cobrade: '1.2.2' },
  landslide: { typeLabel: 'Landslides', cobrade: '1.1.3' },
};
const FETCH_TIMEOUT_MS = 45_000;
const UPSERT_CHUNK = 400;
const STALE_SYNC_MS = 30 * 60 * 1000;
const sourceLocks = new Map();
const sourceTimeouts = new Map();

function delay(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitMs() {
  return process.env.NODE_ENV === 'test' ? 0 : 80;
}

function notDeleted() {
  return { isDeleted: { $ne: true } };
}

async function loadCatalogMaps() {
  return runSyncStage('database', 'load geography catalog', async () => {
    const [regions, states, counties] = await Promise.all([
      Region.find(notDeleted()).select('_id code').lean(),
      State.find(notDeleted()).select('_id code name region').lean(),
      County.find({ ...notDeleted(), IBGECode: { $nin: [null, ''] } })
        .select('_id IBGECode name region state')
        .lean(),
    ]);

    const regionByIbge = new Map();
    for (const row of regions) {
      const letter = String(row.code || '').toUpperCase();
      const id = REGION_LETTER_TO_IBGE_ID[letter] || letter;
      regionByIbge.set(String(id), row);
    }

    const stateByIbge = new Map();
    for (const row of states) {
      const uf = String(row.code || '').toUpperCase();
      const id = UF_TO_IBGE_ID[uf] || uf.replace(/\D/g, '');
      if (id) stateByIbge.set(String(id), row);
    }

    const countyByIbge = new Map();
    const countyToStateIbge = new Map();
    const countyToRegionIbge = new Map();
    const stateByObjectId = new Map(states.map((row) => [String(row._id), row]));
    const regionByObjectId = new Map(regions.map((row) => [String(row._id), row]));
    const stateToRegionIbge = new Map();

    for (const row of states) {
      const uf = String(row.code || '').toUpperCase();
      const id = UF_TO_IBGE_ID[uf] || uf.replace(/\D/g, '');
      const regionRow = row.region ? regionByObjectId.get(String(row.region)) : null;
      const regionLetter = String(regionRow?.code || '').toUpperCase();
      const regionIbge = REGION_LETTER_TO_IBGE_ID[regionLetter] || '';
      if (id && regionIbge) stateToRegionIbge.set(String(id), String(regionIbge));
    }

    for (const row of counties) {
      const id = normalizeMunicipioIbgeId(row.IBGECode);
      if (!id) continue;
      countyByIbge.set(id, row);
      const stateRow = row.state ? stateByObjectId.get(String(row.state)) : null;
      const uf = String(stateRow?.code || '').toUpperCase();
      const stateIbge = UF_TO_IBGE_ID[uf] || uf.replace(/\D/g, '');
      if (stateIbge) countyToStateIbge.set(id, String(stateIbge));
      const regionRow =
        (row.region && regionByObjectId.get(String(row.region))) ||
        (stateRow?.region && regionByObjectId.get(String(stateRow.region))) ||
        null;
      const regionIbge = REGION_LETTER_TO_IBGE_ID[String(regionRow?.code || '').toUpperCase()] || '';
      if (regionIbge) countyToRegionIbge.set(id, String(regionIbge));
    }

    return {
      regionByIbge,
      stateByIbge,
      countyByIbge,
      states,
      stateByObjectId,
      regionByObjectId,
      countyToStateIbge,
      countyToRegionIbge,
      stateToRegionIbge,
    };
  });
}

function resolveSubject(kind, ibgeId, maps) {
  if (kind === 'county') return maps.countyByIbge.get(normalizeMunicipioIbgeId(ibgeId));
  if (kind === 'state') {
    const numeric = /^\d{2}$/.test(ibgeId) ? ibgeId : UF_TO_IBGE_ID[String(ibgeId).toUpperCase()];
    return maps.stateByIbge.get(String(numeric || ibgeId));
  }
  if (kind === 'region') {
    const numeric = REGION_LETTER_TO_IBGE_ID[String(ibgeId).toUpperCase()] || ibgeId;
    return maps.regionByIbge.get(String(numeric));
  }
  return null;
}

function indicatorKey(doc) {
  return [doc.kind, doc.ibgeId, doc.source, doc.series, doc.year, doc.categoryId || ''].join('\0');
}

function collapseIndicatorDocs(docs, mode = 'last') {
  const byKey = new Map();
  for (const doc of docs) {
    const key = indicatorKey(doc);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...doc });
    } else if (mode === 'sum') {
      existing.value += doc.value;
    } else {
      byKey.set(key, { ...doc });
    }
  }
  return [...byKey.values()];
}

async function upsertIndicators(docs) {
  return runSyncStage('save', `upsert indicators (${docs.length})`, async () => {
    const unique = collapseIndicatorDocs(docs, 'last');
    if (!unique.length) return 0;
    let written = 0;
    for (let i = 0; i < unique.length; i += UPSERT_CHUNK) {
      const chunk = unique.slice(i, i + UPSERT_CHUNK);
      const ops = chunk.map((doc) => ({
        updateOne: {
          filter: {
            kind: doc.kind,
            ibgeId: doc.ibgeId,
            source: doc.source,
            series: doc.series,
            year: doc.year,
            categoryId: doc.categoryId || '',
          },
          update: { $set: doc },
          upsert: true,
        },
      }));
      const result = await GeoIndicator.bulkWrite(ops, { ordered: false });
      written += (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    }
    return written;
  });
}

async function upsertDisasters(docs) {
  return runSyncStage('save', `upsert disasters (${docs.length})`, async () => {
    const byId = new Map();
    for (const doc of docs) {
      if (doc?.sourceId) byId.set(doc.sourceId, doc);
    }
    const unique = [...byId.values()];
    if (!unique.length) return 0;
    let written = 0;
    for (let i = 0; i < unique.length; i += UPSERT_CHUNK) {
      const chunk = unique.slice(i, i + UPSERT_CHUNK);
      const ops = chunk.map((doc) => ({
        updateOne: {
          filter: { sourceId: doc.sourceId },
          update: { $set: doc },
          upsert: true,
        },
      }));
      const result = await GeoDisaster.bulkWrite(ops, { ordered: false });
      written += (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    }
    return written;
  });
}

function amendmentWriteDoc(doc) {
  return {
    sourceId: doc.sourceId,
    kind: doc.kind,
    subjectId: doc.subjectId,
    ibgeId: doc.ibgeId,
    county: doc.county || null,
    state: doc.state || null,
    region: doc.region || null,
    year: doc.year,
    code: doc.code || '',
    author: doc.author || '',
    authorType: doc.authorType || '',
    amendmentType: doc.amendmentType || 'other',
    function: doc.function || '',
    subfunction: doc.subfunction || '',
    grupo: doc.grupo || '',
    purpose: doc.purpose || '',
    action: doc.action || '',
    target: doc.target || '',
    targetCode: doc.targetCode || '',
    targetType: doc.targetType || '',
    committed: doc.committed ?? null,
    paid: doc.paid ?? null,
    empenhado: doc.empenhado ?? null,
    fetchedAt: doc.fetchedAt,
  };
}

async function upsertAmendments(docs) {
  return runSyncStage('save', `upsert amendments (${docs.length})`, async () => {
    const byId = new Map();
    for (const doc of docs) {
      if (doc?.sourceId) byId.set(doc.sourceId, doc);
    }
    const unique = [...byId.values()];
    if (!unique.length) return 0;
    let written = 0;
    for (let i = 0; i < unique.length; i += UPSERT_CHUNK) {
      const chunk = unique.slice(i, i + UPSERT_CHUNK);
      const ops = chunk.map((doc) => ({
        updateOne: {
          filter: { sourceId: doc.sourceId },
          update: {
            $set: amendmentWriteDoc(doc),
            $unset: {
              functionName: 1,
              subfunctionName: 1,
              expenseGroup: 1,
              actionName: 1,
            },
          },
          upsert: true,
        },
      }));
      const result = await GeoAmendment.collection.bulkWrite(ops, { ordered: false });
      written += (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    }
    return written;
  });
}

function parentSubject(doc, toKind, maps) {
  if (doc.kind === 'county' && toKind === 'state') {
    const ibgeId = maps.countyToStateIbge.get(doc.ibgeId);
    const subject = ibgeId ? maps.stateByIbge.get(ibgeId) : null;
    return subject ? { kind: 'state', ibgeId, subjectId: subject._id } : null;
  }
  if (doc.kind === 'county' && toKind === 'region') {
    const ibgeId = maps.countyToRegionIbge.get(doc.ibgeId);
    const subject = ibgeId ? maps.regionByIbge.get(ibgeId) : null;
    return subject ? { kind: 'region', ibgeId, subjectId: subject._id } : null;
  }
  if (doc.kind === 'state' && toKind === 'region') {
    const ibgeId = maps.stateToRegionIbge.get(doc.ibgeId);
    const subject = ibgeId ? maps.regionByIbge.get(ibgeId) : null;
    return subject ? { kind: 'region', ibgeId, subjectId: subject._id } : null;
  }
  return null;
}

function rollUpIndicators(docs, toKind, maps) {
  const rolled = [];
  for (const doc of docs) {
    const parent = parentSubject(doc, toKind, maps);
    if (!parent) continue;
    rolled.push({ ...doc, ...parent });
  }
  return collapseIndicatorDocs(rolled, 'sum');
}

function municRowsToDisasterDocs(rows, variableToSeries, maps, fetchedAt) {
  const docs = [];
  for (const row of rows) {
    if (String(row.nivelId || '').toUpperCase() !== 'N6' || !(row.value > 0)) continue;
    const ibgeId = normalizeMunicipioIbgeId(row.ibgeId);
    if (!/^\d{7}$/.test(ibgeId)) continue;
    const series = variableToSeries.get(String(row.variableId));
    const meta = MUNIC_DISASTER_META[series];
    if (!meta) continue;
    const year = Number(row.impactYear || row.year);
    if (!Number.isFinite(year) || year < 1900) continue;
    const county = maps.countyByIbge.get(ibgeId);
    docs.push({
      sourceId: `munic:${ibgeId}:${series}:${year}`,
      county: county?._id,
      ibgeId,
      occurredAt: new Date(`${year}-01-01T00:00:00Z`),
      cobrade: meta.cobrade,
      typeLabel: meta.typeLabel,
      recognition: 'none',
      fetchedAt,
    });
  }
  return docs;
}

function mapSidraRows(rows, source, variableToSeries, maps, fetchedAt) {
  const docs = [];
  for (const row of rows) {
    const kind = nivelToKind(row.nivelId);
    if (!kind) continue;
    const subject = resolveSubject(kind, row.ibgeId, maps);
    if (!subject) continue;
    const series = variableToSeries.get(String(row.variableId));
    if (!series) continue;
    docs.push({
      kind,
      subjectId: subject._id,
      ibgeId: kind === 'county' ? normalizeMunicipioIbgeId(row.ibgeId) : String(row.ibgeId),
      source,
      series,
      year: row.year,
      value: row.value,
      unit: row.unit || '',
      categoryId: row.categoryId || '',
      category: row.category || '',
      fetchedAt,
    });
  }
  return docs;
}

async function probeSidra(sourceDef) {
  const metadata = await getAggregateMetadata(sourceDef.aggregateId);
  const periods = await listAggregatePeriods(sourceDef.aggregateId);
  const available = periods.length ? periods : metadata.fim ? [metadata.fim] : [];
  const latest = available[available.length - 1] || metadata.fim || '';
  return {
    originPeriod: String(latest),
    originFingerprint: `${sourceDef.aggregateId}:${latest}:${sourceDef.classificacao || ''}`,
    periods: available,
    niveis: metadata.niveis,
  };
}

function yearsForSync(probe, stored, force, maxYears) {
  const window = lastNPeriods(probe.periods, maxYears || 5);
  if (force || !stored?.originPeriod) return window;
  if (stored.originFingerprint && stored.originFingerprint !== probe.originFingerprint) return window;
  if (stored.originPeriod === probe.originPeriod) return [];
  const newer = periodsAfter(window, stored.originPeriod);
  return newer.length ? newer : window;
}

async function fetchSidraLevel(sourceDef, years, localidades, classificacao) {
  const variables = sourceDef.variables.map((item) => item.id);
  return fetchAggregateValues({
    aggregateId: sourceDef.aggregateId,
    periods: years,
    variables,
    localidades,
    classificacao: classificacao || sourceDef.classificacao,
  });
}

function catalogUfIds(maps) {
  return [
    ...new Set(
      maps.states
        .map((row) => UF_TO_IBGE_ID[String(row.code || '').toUpperCase()])
        .filter(Boolean)
    ),
  ];
}

async function collectSidraRows(sourceDef, years, nivel, classificacao, maps) {
  const rows = [];
  let failed = 0;
  const classif = classificacao || sourceDef.classificacao;
  const variables = sourceDef.variables.map((item) => item.id);

  if (nivel !== 'N6') {
    try {
      rows.push(...(await fetchSidraLevel(sourceDef, years, `${nivel}[all]`, classif)));
    } catch (error) {
      failed += 1;
      noteSyncError(error, error?.stage || 'fetch', `IBGE ${sourceDef.id} ${nivel}`);
      logSyncConsole(`IBGE ${sourceDef.id} ${nivel} fetch failed`, error);
    }
    await delay(waitMs());
    return { rows, failed };
  }

  const ufIds = catalogUfIds(maps);
  for (const year of years) {
    for (const ufId of ufIds) {
      try {
        rows.push(
          ...(await fetchAggregateValues({
            aggregateId: sourceDef.aggregateId,
            periods: [year],
            variables,
            localidades: `N6[N3[${ufId}]]`,
            classificacao: classif,
          }))
        );
      } catch (error) {
        failed += 1;
        noteSyncError(error, error?.stage || 'fetch', `IBGE ${sourceDef.id} N6 UF ${ufId} year ${year}`);
        logSyncConsole(`IBGE ${sourceDef.id} N6 UF ${ufId} year ${year} fetch failed`, error);
      }
      await delay(waitMs());
    }
  }
  return { rows, failed };
}

async function countyCoverageIncomplete(sourceId) {
  return runSyncStage('database', `county coverage ${sourceId}`, async () => {
    const [syncedIds, catalogCount] = await Promise.all([
      GeoIndicator.distinct('ibgeId', { source: sourceId, kind: 'county' }),
      County.countDocuments({ ...notDeleted(), IBGECode: { $nin: [null, ''] } }),
    ]);
    if (!catalogCount) return false;
    const synced = new Set(syncedIds.map((id) => normalizeMunicipioIbgeId(id)).filter(Boolean));
    return synced.size < catalogCount;
  });
}

async function yearsToFetch(sourceDef, probe, stored, force) {
  let years = yearsForSync(probe, stored, force, sourceDef.maxYears);
  if (years.length) return years;
  if (!(sourceDef.niveis || []).includes('N6')) return [];
  if (!(await countyCoverageIncomplete(sourceDef.id))) return [];
  return lastNPeriods(probe.periods, sourceDef.maxYears || 5);
}

async function syncSidraSource(sourceDef, { force, stored }) {
  const probe = await probeSidra(sourceDef);
  const years = await yearsToFetch(sourceDef, probe, stored, force);
  if (!years.length) {
    return {
      skipped: true,
      reason: 'up_to_date',
      fetched: 0,
      failed: 0,
      done: true,
      remaining: 0,
      originPeriod: probe.originPeriod,
      originFingerprint: probe.originFingerprint,
      rowCount: stored?.rowCount || 0,
    };
  }

  const maps = await loadCatalogMaps();
  const variableToSeries = new Map(sourceDef.variables.map((item) => [String(item.id), item.series]));
  const fetchedAt = new Date();
  const niveis = (sourceDef.niveis || []).filter(
    (nivel) => !probe.niveis.length || probe.niveis.includes(nivel)
  );
  const allDocs = [];
  const disasterDocs = [];
  let failed = 0;

  const ingest = async (rows) => {
    await runSyncStage('process', `map ${sourceDef.id} rows`, () => {
      if (sourceDef.id === 'munic') {
        disasterDocs.push(...municRowsToDisasterDocs(rows, variableToSeries, maps, fetchedAt));
      }
      allDocs.push(
        ...collapseIndicatorDocs(
          mapSidraRows(rows, sourceDef.id, variableToSeries, maps, fetchedAt),
          sourceDef.collapseDuplicates || 'last'
        )
      );
      return true;
    });
  };

  for (const nivel of niveis) {
    const result = await collectSidraRows(sourceDef, years, nivel, sourceDef.classificacao, maps);
    await ingest(result.rows);
    failed += result.failed;
  }

  if (sourceDef.cropClassificacao) {
    for (const nivel of ['N2', 'N3', 'N6']) {
      if (!niveis.includes(nivel)) continue;
      const result = await collectSidraRows(sourceDef, years, nivel, sourceDef.cropClassificacao, maps);
      await ingest(result.rows);
      failed += result.failed;
    }
  }

  const written = await upsertIndicators(allDocs);
  if (disasterDocs.length) await upsertDisasters(disasterDocs);
  const rowCount = await GeoIndicator.countDocuments({ source: sourceDef.id });

  return {
    skipped: false,
    reason: 'updated',
    fetched: written,
    failed,
    done: true,
    remaining: 0,
    originPeriod: probe.originPeriod,
    originFingerprint: probe.originFingerprint,
    rowCount,
  };
}

async function probeMalhas() {
  const [cached, regionCount, stateCount, countyCount] = await Promise.all([
    GeoMalha.countDocuments(),
    Region.countDocuments(notDeleted()),
    State.countDocuments(notDeleted()),
    County.countDocuments({ ...notDeleted(), IBGECode: { $nin: [null, ''] } }),
  ]);
  const catalog = regionCount + stateCount + countyCount;
  return {
    originPeriod: String(catalog),
    originFingerprint: `catalog:${catalog}:cached:${cached}`,
    catalog,
    cached,
  };
}

async function syncMalhasSource({ force, stored }) {
  const probe = await probeMalhas();
  if (!force && stored?.originFingerprint === probe.originFingerprint && probe.cached >= probe.catalog) {
    return {
      skipped: true,
      reason: 'up_to_date',
      fetched: 0,
      failed: 0,
      done: true,
      remaining: 0,
      originPeriod: probe.originPeriod,
      originFingerprint: probe.originFingerprint,
      rowCount: probe.cached,
    };
  }

  const result = await malhasController().runMalhasSync({ force, kinds: ['region', 'state', 'county'] });
  const after = await probeMalhas();
  return {
    skipped: false,
    reason: result.fetched === 0 && result.remaining === 0 ? 'up_to_date' : 'updated',
    fetched: result.fetched,
    failed: result.failed,
    done: result.done,
    remaining: result.remaining,
    originPeriod: after.originPeriod,
    originFingerprint: after.originFingerprint,
    rowCount: after.cached,
    extra: {
      catalog: result.catalog,
      skippedCached: result.skipped,
    },
  };
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const input = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}

function findColumn(headers, patterns) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

function parseRecognition(value) {
  const text = normalizeHeader(value);
  if (/calamidade/.test(text)) return 'calamity';
  if (/emergencia|\bse\b/.test(text)) return 'emergency';
  return 'none';
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const iso = Date.parse(raw);
  if (Number.isFinite(iso)) return new Date(iso);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00Z`);
  return null;
}

function s2idError(message) {
  const error = new Error(message);
  error.status = 502;
  return error;
}

function isBlockedBody(text) {
  const sample = String(text || '')
    .slice(0, 800)
    .toLowerCase();
  return sample.includes('request rejected') || sample.includes('access denied');
}

async function fetchS2idBody(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  noteUpstreamRequest(url);
  return runSyncStage('fetch', fetchLabel(url), async () => {
    let upstream;
    try {
      upstream = await fetch(url, {
        headers: S2ID_FETCH_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const wrapped = s2idError('S2ID open-data portal is unreachable.');
      wrapped.cause = cause;
      throw wrapped;
    }
    const text = await upstream.text();
    if (isBlockedBody(text)) {
      throw s2idError(
        'S2ID open-data portal blocked the request (WAF). Disaster events can still be filled by syncing MUNIC.'
      );
    }
    if (!upstream.ok) {
      throw s2idError('S2ID open-data portal returned an error.');
    }
    return text;
  });
}

async function fetchS2idJson(url, options) {
  const text = await fetchS2idBody(url, options);
  return runSyncStage('process', `parse ${fetchLabel(url)}`, () => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      throw s2idError('S2ID open-data portal returned invalid JSON.');
    }
  });
}

function isS2idDataCsv(resource) {
  const name = String(resource?.name || '').toLowerCase();
  const format = String(resource?.format || '').toLowerCase();
  const url = String(resource?.url || '').toLowerCase();
  if (name.includes('dicion') || name.includes('dictionary')) return false;
  if (format.includes('pdf') || url.endsWith('.pdf')) return false;
  return format.includes('csv') || url.endsWith('.csv') || url.includes('/download/');
}

function resolveS2idIbgeId(raw, maps) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (/^\d{7}$/.test(digits)) {
    return { ibgeId: digits, county: maps.countyByIbge.get(digits) || null };
  }
  if (/^\d{6}$/.test(digits)) {
    for (const [id, county] of maps.countyByIbge) {
      if (id.slice(0, 6) === digits) return { ibgeId: id, county };
    }
  }
  return { ibgeId: '', county: null };
}

function tableToDisasterOps(table, maps, fetchedAt, fileTag) {
  if (!table || table.length < 2) return { ops: [], failed: 0 };
  const headers = table[0].map(normalizeHeader);
  const ibgeIdx = findColumn(headers, [/ibge/, /cd[_\s]?mun/, /codigo.*municipio/, /codmun/, /cod[_\s]?municipio/]);
  const dateIdx = findColumn(headers, [/^data/, /data[_\s]?(registro|evento|ocorr)/, /dt[_\s]?/, /ocorr/]);
  const cobradeIdx = findColumn(headers, [/cobrade/]);
  const typeIdx = findColumn(headers, [/descri/, /tipologia/, /tipo/, /grupo/, /desastre/]);
  const recogIdx = findColumn(headers, [/reconhec/, /situacao/, /decreto/, /status/]);
  const peopleIdx = findColumn(headers, [/afetad/, /desabrig/, /desaloj/, /pessoas/]);
  const damageIdx = findColumn(headers, [/preju/, /dano/, /valor/]);
  const idIdx = findColumn(headers, [/protocolo/, /^id$/, /registro/]);

  const ops = [];
  let failed = 0;
  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i];
    const { ibgeId, county } = resolveS2idIbgeId(ibgeIdx >= 0 ? cells[ibgeIdx] : '', maps);
    if (!ibgeId) {
      failed += 1;
      continue;
    }
    const occurredAt = dateIdx >= 0 ? parseDate(cells[dateIdx]) : null;
    const cobrade = cobradeIdx >= 0 ? String(cells[cobradeIdx] || '').trim() : '';
    const typeLabel = typeIdx >= 0 ? String(cells[typeIdx] || '').trim() : '';
    const sourceId =
      (idIdx >= 0 && String(cells[idIdx] || '').trim()) ||
      `s2id:${ibgeId}:${occurredAt ? occurredAt.toISOString().slice(0, 10) : `${fileTag}:${i}`}:${cobrade}`;
    ops.push({
      sourceId,
      county: county?._id,
      ibgeId,
      occurredAt,
      cobrade,
      typeLabel,
      recognition: recogIdx >= 0 ? parseRecognition(cells[recogIdx]) : 'none',
      affectedPeople:
        peopleIdx >= 0 ? Number(String(cells[peopleIdx]).replace(/\D/g, '')) || undefined : undefined,
      damages:
        damageIdx >= 0
          ? Number(String(cells[damageIdx]).replace(/[^\d.,-]/g, '').replace(',', '.')) || undefined
          : undefined,
      fetchedAt,
    });
  }
  return { ops, failed };
}

async function probeS2id() {
  const payload = await fetchS2idJson(S2ID_PACKAGE_URL, { timeoutMs: FETCH_TIMEOUT_MS });
  const pkg = payload?.result || payload;
  const resources = Array.isArray(pkg?.resources) ? pkg.resources.filter(isS2idDataCsv) : [];
  const modified =
    pkg?.metadata_modified || resources[0]?.last_modified || resources[0]?.metadata_modified || '';
  return {
    originPeriod: String(modified || ''),
    originFingerprint: `${modified}:${resources.map((item) => item.id || item.url).join(',')}`,
    originUpdatedAt: modified ? new Date(modified) : null,
    resources,
  };
}

async function syncS2idSource({ force, stored }) {
  const probe = await probeS2id();
  if (!force && stored?.originFingerprint && stored.originFingerprint === probe.originFingerprint) {
    return {
      skipped: true,
      reason: 'up_to_date',
      fetched: 0,
      failed: 0,
      done: true,
      remaining: 0,
      originPeriod: probe.originPeriod,
      originFingerprint: probe.originFingerprint,
      originUpdatedAt: probe.originUpdatedAt,
      rowCount: stored.rowCount || 0,
    };
  }
  if (!probe.resources.length) {
    throw s2idError('S2ID CSV resource was not found.');
  }

  const maps = await loadCatalogMaps();
  const fetchedAt = new Date();
  const docs = [];
  let failed = 0;

  for (const resource of probe.resources) {
    if (!resource.url) {
      failed += 1;
      continue;
    }
    const text = await fetchS2idBody(resource.url, { timeoutMs: S2ID_CSV_TIMEOUT_MS });
    const parsed = await runSyncStage('process', `parse s2id ${resource.id || resource.name || 'csv'}`, () =>
      tableToDisasterOps(parseCsv(text), maps, fetchedAt, resource.id || resource.name || 'csv')
    );
    docs.push(...parsed.ops);
    failed += parsed.failed;
    await delay(waitMs());
  }

  const fetched = await upsertDisasters(docs);
  const rowCount = await GeoDisaster.countDocuments();

  return {
    skipped: false,
    reason: 'updated',
    fetched,
    failed,
    done: true,
    remaining: 0,
    originPeriod: probe.originPeriod,
    originFingerprint: probe.originFingerprint,
    originUpdatedAt: probe.originUpdatedAt,
    rowCount,
  };
}

function skipIfFresh(stored, probe, force) {
  return (
    !force &&
    stored?.rowCount > 0 &&
    stored?.originFingerprint &&
    probe?.originFingerprint &&
    stored.originFingerprint === probe.originFingerprint
  );
}

async function amendmentsNeedRewrite() {
  const total = await GeoAmendment.countDocuments();
  if (!total) return true;
  const stale = await GeoAmendment.exists({
    $or: [{ function: { $exists: false } }, { grupo: { $exists: false } }, { action: { $exists: false } }],
  });
  return Boolean(stale);
}

async function syncSiconfiSource({ force, stored }) {
  const probe = await probeSiconfi(5);
  const incomplete = await countyCoverageIncomplete('siconfi');
  if (skipIfFresh(stored, probe, force) && !incomplete) {
    return {
      skipped: true,
      reason: 'up_to_date',
      fetched: 0,
      failed: 0,
      done: true,
      remaining: 0,
      originPeriod: probe.originPeriod,
      originFingerprint: probe.originFingerprint,
      rowCount: stored.rowCount || 0,
    };
  }

  const maps = await loadCatalogMaps();
  const fetchedAt = new Date();
  const { docs, failed } = await collectSiconfiDocs({ years: probe.years, maps, fetchedAt });
  const withRegions = [...docs, ...rollUpIndicators(docs.filter((row) => row.kind === 'county'), 'region', maps)];
  const fetched = await upsertIndicators(collapseIndicatorDocs(withRegions, 'sum'));
  const rowCount = await GeoIndicator.countDocuments({ source: 'siconfi' });
  return {
    skipped: false,
    reason: 'updated',
    fetched,
    failed,
    done: true,
    remaining: 0,
    originPeriod: probe.originPeriod,
    originFingerprint: probe.originFingerprint,
    rowCount,
  };
}

async function syncTransfersSource({ force, stored }) {
  const probe = await probeTransfers(5);
  const incomplete = await countyCoverageIncomplete('transfers');
  if (skipIfFresh(stored, probe, force) && !incomplete) {
    return {
      skipped: true,
      reason: 'up_to_date',
      fetched: 0,
      failed: 0,
      done: true,
      remaining: 0,
      originPeriod: probe.originPeriod,
      originFingerprint: probe.originFingerprint,
      rowCount: stored.rowCount || 0,
    };
  }

  const maps = await loadCatalogMaps();
  const fetchedAt = new Date();
  let fetched = 0;
  const { docs, failed } = await collectTransferDocs({
    years: probe.years,
    types: probe.types,
    maps,
    fetchedAt,
    onBatch: async (batch) => {
      if (!batch.length) return;
      const countyDocs = batch.filter((row) => row.kind === 'county');
      const stateDocs = batch.filter((row) => row.kind === 'state');
      const rolled = [
        ...batch,
        ...rollUpIndicators(countyDocs, 'state', maps),
        ...rollUpIndicators(countyDocs, 'region', maps),
        ...rollUpIndicators(stateDocs, 'region', maps),
      ];
      fetched += await upsertIndicators(collapseIndicatorDocs(rolled, 'sum'));
      const rowCount = await GeoIndicator.countDocuments({ source: 'transfers' });
      await GeoSyncState.updateOne(
        { source: 'transfers' },
        { $set: { rowCount, lastSyncedAt: new Date() } }
      );
    },
  });
  if (!fetched && docs.length) {
    const countyDocs = docs.filter((row) => row.kind === 'county');
    const stateDocs = docs.filter((row) => row.kind === 'state');
    const rolled = [
      ...docs,
      ...rollUpIndicators(countyDocs, 'state', maps),
      ...rollUpIndicators(countyDocs, 'region', maps),
      ...rollUpIndicators(stateDocs, 'region', maps),
    ];
    fetched = await upsertIndicators(collapseIndicatorDocs(rolled, 'sum'));
  }
  const rowCount = await GeoIndicator.countDocuments({ source: 'transfers' });
  return {
    skipped: false,
    reason: 'updated',
    fetched,
    failed,
    done: true,
    remaining: 0,
    originPeriod: probe.originPeriod,
    originFingerprint: probe.originFingerprint,
    rowCount,
  };
}

async function syncEmendasSource({ force, stored }) {
  const probe = await probeEmendas();
  const incomplete = await countyCoverageIncomplete('emendas');
  const staleShape = await amendmentsNeedRewrite();
  if (skipIfFresh(stored, probe, force) && !incomplete && !staleShape) {
    return {
      skipped: true,
      reason: 'up_to_date',
      fetched: 0,
      failed: 0,
      done: true,
      remaining: 0,
      originPeriod: probe.originPeriod,
      originFingerprint: probe.originFingerprint,
      originUpdatedAt: probe.originUpdatedAt,
      rowCount: stored.rowCount || 0,
    };
  }

  const maps = await loadCatalogMaps();
  const fetchedAt = new Date();
  const minYear = new Date().getFullYear() - 4;
  const {
    amendments,
    indicators,
    failed,
    yearSkip = 0,
    noLocality = 0,
    diag = '',
  } = await collectEmendaDocs({
    maps,
    fetchedAt,
    minYear,
    csvUrl: probe.csvUrl,
  });
  const parsedMeta = { yearSkip, noLocality, diag };
  const countyIndicators = indicators.filter((row) => row.kind === 'county');
  const stateIndicators = indicators.filter((row) => row.kind === 'state');
  const rolled = [
    ...indicators,
    ...rollUpIndicators(countyIndicators, 'state', maps),
    ...rollUpIndicators(countyIndicators, 'region', maps),
    ...rollUpIndicators(stateIndicators, 'region', maps),
  ];
  const [fetchedAmendments, fetchedIndicators] = await Promise.all([
    upsertAmendments(amendments),
    upsertIndicators(collapseIndicatorDocs(rolled, 'sum')),
  ]);
  const rowCount = await GeoAmendment.countDocuments();
  if (!amendments.length) {
    console.error(
      `Emendas sync parsed 0 rows (failed ${failed}, yearSkip ${parsedMeta.yearSkip || 0}, noLocality ${parsedMeta.noLocality || 0}). ${parsedMeta.diag || ''} Not marking origin as fresh.`
    );
  }
  return {
    skipped: false,
    reason: 'updated',
    fetched: fetchedAmendments + fetchedIndicators,
    failed,
    done: true,
    remaining: 0,
    originPeriod: probe.originPeriod,
    originFingerprint: rowCount ? probe.originFingerprint : '',
    originUpdatedAt: probe.originUpdatedAt,
    rowCount,
  };
}

async function getOrCreateState(source) {
  const existing = await GeoSyncState.findOne({ source }).lean();
  if (existing) return existing;
  const created = await GeoSyncState.create({ source, status: 'idle' });
  return created.toObject();
}

async function probeSource(sourceDef) {
  if (sourceDef.kind === 'malhas') return probeMalhas();
  if (sourceDef.kind === 's2id') return probeS2id();
  if (sourceDef.kind === 'siconfi') return probeSiconfi(sourceDef.maxYears || 5);
  if (sourceDef.kind === 'transfers') return probeTransfers(sourceDef.maxYears || 5);
  if (sourceDef.kind === 'emendas') return probeEmendas();
  return probeSidra(sourceDef);
}

function isUpToDate(sourceDef, stored, probe) {
  if (!stored?.lastSuccessAt || !probe) return false;
  if (stored.status === 'failed') return false;
  if (sourceDef.kind === 'malhas') {
    return stored.originFingerprint === probe.originFingerprint && probe.cached >= probe.catalog;
  }
  if (sourceDef.kind === 's2id' || sourceDef.kind === 'siconfi' || sourceDef.kind === 'transfers' || sourceDef.kind === 'emendas') {
    return Boolean(stored.originFingerprint) && stored.originFingerprint === probe.originFingerprint;
  }
  if (stored.originFingerprint && probe.originFingerprint) {
    return stored.originFingerprint === probe.originFingerprint;
  }
  return Boolean(stored.originPeriod) && stored.originPeriod === probe.originPeriod;
}

function isActivelySyncing(sourceId) {
  return sourceLocks.has(sourceId);
}

function clearSyncTimeout(sourceId) {
  const timer = sourceTimeouts.get(sourceId);
  if (!timer) return;
  clearTimeout(timer);
  sourceTimeouts.delete(sourceId);
}

async function expireRunningSync(sourceId, { startedAt, reason } = {}) {
  const lockedAt = sourceLocks.get(sourceId);
  if (lockedAt == null) return { reset: false, sources: [] };
  if (startedAt != null && lockedAt !== startedAt) return { reset: false, sources: [] };

  sourceLocks.delete(sourceId);
  clearSyncTimeout(sourceId);
  if (sourceId === 'malhas') {
    try {
      malhasController().resetMalhasSyncLock();
    } catch (error) {
      console.error('Failed to reset map cache sync lock', error);
    }
  }

  const stored = await GeoSyncState.findOne({ source: sourceId }).lean();
  const message = reason || `Sync timed out after ${Math.round(STALE_SYNC_MS / 60000)} minutes.`;
  if (stored?.status === 'syncing') {
    await GeoSyncState.updateOne(
      { source: sourceId, status: 'syncing' },
      {
        $set: {
          status: stored.lastSuccessAt ? 'updated' : 'idle',
          lastError: message,
          lastSyncedAt: new Date(),
        },
      }
    );
  }

  await recordAction({
    username: 'system',
    action: 'geo.sync_reset',
    resourceType: 'GEO',
    resourceId: sourceId,
    method: 'POST',
    path: '/api/geo/sync',
    statusCode: 200,
    success: true,
    message: `${message} Reset ${sourceId}.`,
    meta: { sources: [sourceId], reason: message, timeoutMs: STALE_SYNC_MS },
  });
  return { reset: true, sources: [sourceId] };
}

function armSyncTimeout(sourceId, startedAt) {
  clearSyncTimeout(sourceId);
  const timer = setTimeout(() => {
    sourceTimeouts.delete(sourceId);
    void expireRunningSync(sourceId, { startedAt }).catch((error) => {
      console.error(`Failed to time out geography ${sourceId} sync`, error);
    });
  }, STALE_SYNC_MS);
  if (typeof timer.unref === 'function') timer.unref();
  sourceTimeouts.set(sourceId, timer);
}

async function releaseStaleSyncLocks() {
  const rows = await GeoSyncState.find({ status: 'syncing' }).select('source').lean();
  const stale = rows.filter((row) => !sourceLocks.has(row.source)).map((row) => row.source);
  if (!stale.length) return;
  await GeoSyncState.updateMany(
    { source: { $in: stale }, status: 'syncing' },
    { $set: { status: 'failed', lastError: 'Sync interrupted.' } }
  );
}

async function recoverStaleSyncStates({ reason = 'Sync was reset on server start.' } = {}) {
  const rows = await GeoSyncState.find({ status: 'syncing' }).select('source lastSuccessAt').lean();
  for (const sourceId of [...sourceLocks.keys()]) {
    clearSyncTimeout(sourceId);
    sourceLocks.delete(sourceId);
  }
  try {
    malhasController().resetMalhasSyncLock();
  } catch (error) {
    console.error('Failed to reset map cache sync lock', error);
  }

  if (!rows.length) return { reset: 0, sources: [] };

  await Promise.all(
    rows.map((row) =>
      GeoSyncState.updateOne(
        { _id: row._id, status: 'syncing' },
        {
          $set: {
            status: row.lastSuccessAt ? 'updated' : 'idle',
            lastError: reason,
            lastSyncedAt: new Date(),
          },
        }
      )
    )
  );

  const sources = rows.map((row) => row.source);
  await recordAction({
    username: 'system',
    action: 'geo.sync_reset',
    resourceType: 'GEO',
    method: 'POST',
    path: '/api/geo/sync',
    statusCode: 200,
    success: true,
    message: `${reason} Reset ${sources.length} source(s): ${sources.join(', ')}.`,
    meta: { sources, reason },
  });
  return { reset: sources.length, sources };
}

function startSyncStatusWatchdog() {
  if (process.env.NODE_ENV === 'test') {
    return { stop() {} };
  }
  void recoverStaleSyncStates().catch((error) => {
    console.error('Failed to reset geography sync status', error);
  });
  return { stop() {} };
}

function serializeStoredStatus(sourceDef, stored, { probe = null, probeError = null } = {}) {
  const syncing = isActivelySyncing(sourceDef.id);
  const upToDate = probe ? isUpToDate(sourceDef, stored, probe) : stored?.status === 'up_to_date';
  let status = stored?.status || 'idle';
  if (syncing) status = 'syncing';
  else if (stored?.status === 'failed') status = 'failed';
  else if (!stored?.lastSuccessAt) status = 'idle';
  else if (probe) {
    if (upToDate) status = 'up_to_date';
    else if (!probeError) status = 'updated';
  }
  return {
    source: sourceDef.id,
    label: sourceDef.label,
    description: sourceDef.description,
    status,
    upToDate,
    lastSyncedAt: stored?.lastSyncedAt || null,
    lastSuccessAt: stored?.lastSuccessAt || null,
    originPeriod: probe?.originPeriod || stored?.originPeriod || '',
    originUpdatedAt: probe?.originUpdatedAt || stored?.originUpdatedAt || null,
    rowCount: stored?.rowCount || 0,
    lastError: stored?.lastError || probeError || '',
  };
}

async function listSyncStatus({ probe = false } = {}) {
  await releaseStaleSyncLocks();
  const storedRows = await GeoSyncState.find({ source: { $in: SOURCE_CATALOG.map((item) => item.id) } }).lean();
  const storedById = new Map(storedRows.map((row) => [row.source, row]));

  if (!probe) {
    return {
      items: SOURCE_CATALOG.map((sourceDef) =>
        serializeStoredStatus(sourceDef, storedById.get(sourceDef.id) || null)
      ),
    };
  }

  const probed = await Promise.all(
    SOURCE_CATALOG.map(async (sourceDef) => {
      const stored = storedById.get(sourceDef.id) || null;
      let origin = null;
      let probeError = null;
      try {
        origin = await probeSource(sourceDef);
      } catch (error) {
        probeError = error instanceof Error ? error.message : 'Probe failed.';
      }
      return { sourceDef, stored, origin, probeError };
    })
  );

  return {
    items: probed.map(({ sourceDef, stored, origin, probeError }) =>
      serializeStoredStatus(sourceDef, stored, { probe: origin, probeError })
    ),
  };
}

function unknownSourceError() {
  const error = new Error('Unknown geography source.');
  error.status = 400;
  error.code = 'VALIDATION';
  return error;
}

function conflictError(label) {
  const error = new Error(`A ${label} sync is already running.`);
  error.status = 409;
  error.code = 'CONFLICT';
  return error;
}

function geoSyncOutcomeMessage({ username, sourceDef, result, error, durationMs }) {
  const actor = username || 'anonymous';
  const label = sourceDef.label || sourceDef.id;
  let outcome;
  if (error) {
    const stage = error.stage ? ` [${error.stage}]` : '';
    outcome = `failed${stage} (${error instanceof Error ? error.message : 'Sync failed.'})`;
  } else if (result.skipped) {
    outcome = `skipped (${result.reason || 'up_to_date'})`;
  } else if (result.failed && !result.fetched) {
    outcome = `failed (${result.failed || 0} errors)`;
  } else if (result.failed) {
    outcome = `completed with errors (fetched ${result.fetched || 0}, failed ${result.failed})`;
  } else {
    outcome = 'updated';
  }

  const details = [];
  if (!error && !result.skipped) {
    if (result.fetched != null) details.push(`fetched ${result.fetched}`);
    if (result.failed) details.push(`failed ${result.failed}`);
  }
  if (result.rowCount != null) details.push(`${result.rowCount} rows`);
  if (result.originPeriod) details.push(`origin ${result.originPeriod}`);
  if (result.remaining) details.push(`${result.remaining} remaining`);
  if (durationMs != null) details.push(`${durationMs}ms`);

  return [`${actor} geography sync ${outcome} for ${label}`, details.length ? details.join(', ') : null]
    .filter(Boolean)
    .join(' — ');
}

async function recordGeoSyncResult({
  sourceDef,
  force = false,
  actor = {},
  result = {},
  error,
  durationMs,
  requestLog,
  syncDebug,
}) {
  const failedHard = Boolean(error) || (result.failed && !result.fetched && !result.skipped);
  const username = actor.username || 'system';
  const errorMessage = error
    ? error instanceof Error
      ? error.message
      : String(error)
    : result.failed && !result.fetched
      ? 'Sync completed with errors.'
      : '';
  await recordAction({
    userId: actor.userId || null,
    username,
    action: 'geo.sync',
    resourceType: 'GEO',
    resourceId: sourceDef.id,
    method: 'POST',
    path: '/api/geo/sync',
    statusCode: failedHard ? 502 : 200,
    success: !failedHard,
    ipAddress: actor.ipAddress || '',
    userAgent: actor.userAgent || '',
    clientApp: actor.clientApp || 'rbac-platform',
    message: geoSyncOutcomeMessage({ username, sourceDef, result, error, durationMs }),
    meta: {
      source: sourceDef.id,
      label: sourceDef.label || sourceDef.id,
      force: Boolean(force),
      skipped: Boolean(result.skipped),
      reason: result.reason || (error ? 'error' : ''),
      fetched: result.fetched ?? 0,
      failed: result.failed ?? 0,
      done: result.done !== false && !error,
      remaining: result.remaining || 0,
      originPeriod: result.originPeriod || '',
      rowCount: result.rowCount || 0,
      durationMs,
      error: errorMessage,
      failedStage: error?.stage || syncDebug?.failedStage || '',
      stages: syncDebug?.stages || [],
      stageErrors: syncDebug?.stageErrors || [],
      stagesTruncated: Boolean(syncDebug?.stagesTruncated),
      ...(syncDebug?.debugError ? { debugError: syncDebug.debugError } : {}),
      ...requestLogMeta(requestLog),
    },
  });
}

function ownsSync(sourceId, claimedAt) {
  return claimedAt != null && sourceLocks.get(sourceId) === claimedAt;
}

async function executeClaimedSync(sourceDef, { force, stored, actor, claimedAt } = {}) {
  const startedAt = Date.now();
  let requestLog = requestLogMeta();
  let syncDebug;
  try {
    const wrapped = await withUpstreamRequestLog(async () => {
      const inner = await withSyncDebug(async () => {
        let result;
        if (sourceDef.kind === 'malhas') result = await syncMalhasSource({ force, stored });
        else if (sourceDef.kind === 's2id') result = await syncS2idSource({ force, stored });
        else if (sourceDef.kind === 'siconfi') result = await syncSiconfiSource({ force, stored });
        else if (sourceDef.kind === 'transfers') result = await syncTransfersSource({ force, stored });
        else if (sourceDef.kind === 'emendas') result = await syncEmendasSource({ force, stored });
        else result = await syncSidraSource(sourceDef, { force, stored });

        const status = result.skipped ? 'up_to_date' : result.failed && !result.fetched ? 'failed' : 'updated';
        if (ownsSync(sourceDef.id, claimedAt)) {
          await GeoSyncState.updateOne(
            { source: sourceDef.id },
            {
              $set: {
                status: result.skipped ? 'up_to_date' : status,
                lastSyncedAt: new Date(),
                lastSuccessAt: new Date(),
                originPeriod: result.originPeriod || stored.originPeriod || '',
                originFingerprint: result.originFingerprint || stored.originFingerprint || '',
                originUpdatedAt: result.originUpdatedAt || stored.originUpdatedAt,
                rowCount: result.rowCount || 0,
                lastError:
                  result.failed && !result.fetched ? 'Sync completed with errors.' : '',
              },
            }
          );
        }

        return {
          source: sourceDef.id,
          skipped: Boolean(result.skipped),
          reason: result.reason,
          fetched: result.fetched,
          failed: result.failed,
          done: result.done !== false,
          remaining: result.remaining || 0,
          originPeriod: result.originPeriod || '',
          rowCount: result.rowCount || 0,
        };
      });
      syncDebug = inner.debug;
      return inner.result;
    });
    requestLog = wrapped.log;
    await recordGeoSyncResult({
      sourceDef,
      force,
      actor,
      result: wrapped.result,
      durationMs: Date.now() - startedAt,
      requestLog,
      syncDebug,
    });
    return wrapped.result;
  } catch (error) {
    requestLog = error.upstreamRequestLog || requestLog;
    syncDebug = error.syncDebug || syncDebug;
    const stage = error?.stage || syncDebug?.failedStage;
    const message = error instanceof Error ? error.message : 'Sync failed.';
    if (ownsSync(sourceDef.id, claimedAt)) {
      await GeoSyncState.updateOne(
        { source: sourceDef.id },
        {
          $set: {
            status: 'failed',
            lastSyncedAt: new Date(),
            lastError: stage ? `[${stage}] ${message}` : message,
          },
        }
      );
    }
    await recordGeoSyncResult({
      sourceDef,
      force,
      actor,
      error,
      durationMs: Date.now() - startedAt,
      requestLog,
      syncDebug,
    });
    throw error;
  } finally {
    if (ownsSync(sourceDef.id, claimedAt)) {
      clearSyncTimeout(sourceDef.id);
      sourceLocks.delete(sourceDef.id);
    }
  }
}

async function claimSync(sourceId) {
  const sourceDef = getSource(sourceId);
  if (!sourceDef) throw unknownSourceError();
  if (sourceLocks.has(sourceDef.id)) throw conflictError(sourceDef.label);

  const claimedAt = Date.now();
  sourceLocks.set(sourceDef.id, claimedAt);
  try {
    const stored = await getOrCreateState(sourceDef.id);
    await GeoSyncState.updateOne(
      { source: sourceDef.id },
      { $set: { status: 'syncing', lastSyncedAt: new Date(), lastError: '' } }
    );
    armSyncTimeout(sourceDef.id, claimedAt);
    return { sourceDef, stored, claimedAt };
  } catch (error) {
    clearSyncTimeout(sourceDef.id);
    sourceLocks.delete(sourceDef.id);
    throw error;
  }
}

async function startSyncSource(sourceId, { force = false, actor } = {}) {
  const { sourceDef, stored, claimedAt } = await claimSync(sourceId);
  setImmediate(() => {
    executeClaimedSync(sourceDef, { force, stored, actor, claimedAt }).catch((error) => {
      console.error(`Geography ${sourceDef.id} sync failed`, error);
    });
  });
  return { source: sourceDef.id, accepted: true, status: 'syncing' };
}

async function syncSource(sourceId, { force = false, actor } = {}) {
  const { sourceDef, stored, claimedAt } = await claimSync(sourceId);
  return executeClaimedSync(sourceDef, { force, stored, actor, claimedAt });
}

module.exports = {
  listSyncStatus,
  startSyncSource,
  syncSource,
  recoverStaleSyncStates,
  expireRunningSync,
  startSyncStatusWatchdog,
  STALE_SYNC_MS,
  probeSidra,
  probeMalhas,
  probeS2id,
  parseCsv,
  S2ID_PACKAGE_URL,
};
