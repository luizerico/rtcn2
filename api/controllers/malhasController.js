const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');
const { GeoMalha, Region, State, County } = require('../models/geo');
const { noteUpstreamRequest, withUpstreamRequestLog, requestLogMeta } = require('../services/upstreamRequestLog');
const { runSyncStage, fetchLabel, noteSyncError, logSyncConsole } = require('../services/geoSyncDebug');

const IBGE_MALHAS_BASE = 'https://servicodados.ibge.gov.br/api/v3/malhas';
const FETCH_TIMEOUT_MS = 10_000;

const KIND_TO_IBGE_PATH = {
  county: 'municipios',
  state: 'estados',
  region: 'regioes',
};

const REGION_LETTER_TO_IBGE_ID = {
  N: '1',
  NE: '2',
  SE: '3',
  S: '4',
  CO: '5',
};

const cache = new Map();

function clearMalhasCache() {
  cache.clear();
}

function resolveIbgeTarget(kindRaw, codeRaw) {
  const kind = String(kindRaw || '')
    .trim()
    .toLowerCase();
  const ibgePath = KIND_TO_IBGE_PATH[kind];
  if (!ibgePath) {
    return { error: 'kind must be county, state, or region.' };
  }

  const code = String(codeRaw || '').trim();
  if (!code) {
    return { error: 'code is required.' };
  }

  let ibgeId = code;
  if (kind === 'county') {
    ibgeId = code.replace(/\D/g, '');
    if (!/^\d{7}$/.test(ibgeId)) {
      return { error: 'County code must be a 7-digit IBGE municipality code.' };
    }
  } else if (kind === 'state') {
    ibgeId = code.toUpperCase();
    if (!/^[A-Z]{2}$/.test(ibgeId) && !/^\d{2}$/.test(ibgeId)) {
      return { error: 'State code must be a UF (e.g. GO) or 2-digit IBGE id.' };
    }
  } else if (kind === 'region') {
    const upper = code.toUpperCase();
    ibgeId = REGION_LETTER_TO_IBGE_ID[upper] || upper;
    if (!/^[1-5]$/.test(ibgeId)) {
      return { error: 'Region code must be N, NE, SE, S, CO, or IBGE id 1–5.' };
    }
  }

  const params = new URLSearchParams({
    formato: 'application/vnd.geo+json',
    qualidade: 'minima',
  });
  const url = `${IBGE_MALHAS_BASE}/${ibgePath}/${encodeURIComponent(ibgeId)}?${params}`;
  return { kind, ibgeId, url, cacheKey: `${kind}:${ibgeId}` };
}

async function loadFromMongo(kind, ibgeId) {
  const row = await GeoMalha.findOne({ kind, ibgeId }).lean();
  return row?.geojson || null;
}

async function persistMalha(kind, ibgeId, geojson) {
  try {
    await runSyncStage('save', `malha ${kind}:${ibgeId}`, () =>
      GeoMalha.updateOne(
        { kind, ibgeId },
        { $set: { kind, ibgeId, geojson, fetchedAt: new Date() } },
        { upsert: true }
      )
    );
  } catch (error) {
    noteSyncError(error, 'save', `malha ${kind}:${ibgeId}`);
    logSyncConsole('Failed to persist IBGE malha cache', error);
  }
}

function remember(cacheKey, geojson) {
  cache.set(cacheKey, geojson);
  return geojson;
}

async function fetchIbgeGeoJson(url) {
  noteUpstreamRequest(url);
  return runSyncStage('fetch', fetchLabel(url), async () => {
    let upstream;
    try {
      upstream = await fetch(url, {
        headers: { Accept: 'application/geo+json, application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      const wrapped = new Error('IBGE malhas service is unreachable.');
      wrapped.cause = error;
      wrapped.status = 502;
      wrapped.code = ERROR_CODES.INTERNAL;
      throw wrapped;
    }

    const text = await upstream.text();
    if (upstream.status === 404) {
      const notFound = new Error('IBGE boundary not found.');
      notFound.status = 404;
      notFound.code = ERROR_CODES.NOT_FOUND;
      throw notFound;
    }
    if (!upstream.ok) {
      const bad = new Error('IBGE malhas service returned an error.');
      bad.status = 502;
      bad.code = ERROR_CODES.INTERNAL;
      throw bad;
    }

    try {
      return text ? JSON.parse(text) : {};
    } catch {
      const invalid = new Error('IBGE malhas service returned invalid JSON.');
      invalid.status = 502;
      invalid.code = ERROR_CODES.INTERNAL;
      throw invalid;
    }
  });
}

async function getMalha(req, res) {
  try {
    const resolved = resolveIbgeTarget(req.params.kind, req.params.code);
    if (resolved.error) {
      return sendError(res, 400, resolved.error, ERROR_CODES.VALIDATION);
    }

    const { kind, ibgeId, url, cacheKey } = resolved;

    const fromMemory = cache.get(cacheKey);
    if (fromMemory) {
      return res.status(200).json(fromMemory);
    }

    const fromMongo = await loadFromMongo(kind, ibgeId);
    if (fromMongo) {
      return res.status(200).json(remember(cacheKey, fromMongo));
    }

    let payload;
    try {
      payload = await fetchIbgeGeoJson(url);
    } catch (error) {
      const stale = await loadFromMongo(kind, ibgeId);
      if (stale) {
        return res.status(200).json(remember(cacheKey, stale));
      }
      if (error.status === 404) {
        return sendError(res, 404, error.message, error.code);
      }
      if (error.status === 502) {
        return sendServerError(res, error.cause || error, error.message, {
          status: 502,
          code: error.code || ERROR_CODES.INTERNAL,
        });
      }
      throw error;
    }

    await persistMalha(kind, ibgeId, payload);
    return res.status(200).json(remember(cacheKey, payload));
  } catch (error) {
    return sendServerError(res, error, 'Error fetching IBGE boundary');
  }
}

const SYNC_KINDS = ['region', 'state', 'county'];
const SYNC_BATCH = 40;
let syncLock = false;
let syncLockAt = 0;

function resetMalhasSyncLock({ olderThanMs = 0 } = {}) {
  if (!syncLock) return false;
  if (olderThanMs > 0 && Date.now() - syncLockAt < olderThanMs) return false;
  syncLock = false;
  syncLockAt = 0;
  return true;
}

function parseSyncKinds(raw) {
  if (raw == null) return { kinds: [...SYNC_KINDS] };
  if (!Array.isArray(raw)) {
    return { error: 'kinds must be an array of county, state, and/or region.' };
  }
  const kinds = [...new Set(raw.map((item) => String(item).trim().toLowerCase()))];
  if (!kinds.length || kinds.some((kind) => !SYNC_KINDS.includes(kind))) {
    return { error: 'kinds must be county, state, and/or region.' };
  }
  return { kinds };
}

function notDeleted() {
  return { isDeleted: { $ne: true } };
}

async function listCatalogTargets(kinds) {
  const targets = [];

  if (kinds.includes('region')) {
    const rows = await Region.find(notDeleted()).select('code').lean();
    for (const row of rows) {
      const resolved = resolveIbgeTarget('region', row.code);
      if (!resolved.error) targets.push(resolved);
    }
  }
  if (kinds.includes('state')) {
    const rows = await State.find(notDeleted()).select('code').lean();
    for (const row of rows) {
      const resolved = resolveIbgeTarget('state', row.code);
      if (!resolved.error) targets.push(resolved);
    }
  }
  if (kinds.includes('county')) {
    const rows = await County.find({
      ...notDeleted(),
      IBGECode: { $nin: [null, ''] },
    })
      .select('IBGECode')
      .lean();
    for (const row of rows) {
      const resolved = resolveIbgeTarget('county', row.IBGECode);
      if (!resolved.error) targets.push(resolved);
    }
  }

  return targets;
}

async function cachedKeySet(kinds) {
  const rows = await GeoMalha.find({ kind: { $in: kinds } }).select('kind ibgeId').lean();
  return new Set(rows.map((row) => `${row.kind}:${row.ibgeId}`));
}

function delay(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMalhasSync({ force = false, kinds = SYNC_KINDS } = {}) {
  if (syncLock) {
    const error = new Error('A map cache sync is already running.');
    error.status = 409;
    error.code = ERROR_CODES.CONFLICT;
    throw error;
  }

  syncLock = true;
  syncLockAt = Date.now();
  const lockStartedAt = syncLockAt;
  const timeout = setTimeout(() => {
    if (syncLock && syncLockAt === lockStartedAt) {
      syncLock = false;
      syncLockAt = 0;
    }
  }, 30 * 60 * 1000);
  if (typeof timeout.unref === 'function') timeout.unref();
  try {
    const targets = await listCatalogTargets(kinds);
    const cached = force ? new Set() : await cachedKeySet(kinds);
    const pending = force ? targets : targets.filter((item) => !cached.has(item.cacheKey));
    const skipped = targets.length - pending.length;
    const batch = pending.slice(0, SYNC_BATCH);
    const fetched = [];
    const failures = [];
    const waitMs = process.env.NODE_ENV === 'test' ? 0 : 50;

    for (const item of batch) {
      try {
        const payload = await fetchIbgeGeoJson(item.url);
        await persistMalha(item.kind, item.ibgeId, payload);
        remember(item.cacheKey, payload);
        fetched.push({ kind: item.kind, ibgeId: item.ibgeId });
      } catch (error) {
        failures.push({
          kind: item.kind,
          ibgeId: item.ibgeId,
          message: error.message || 'IBGE fetch failed',
        });
      }
      if (waitMs) await delay(waitMs);
    }

    const remaining = pending.length - batch.length;
    return {
      done: remaining === 0,
      force,
      kinds,
      catalog: targets.length,
      skipped,
      fetched: fetched.length,
      failed: failures.length,
      remaining,
      failures: failures.slice(0, 20),
    };
  } finally {
    clearTimeout(timeout);
    syncLock = false;
    syncLockAt = 0;
  }
}

async function getMalhaStats(_req, res) {
  try {
    const [cachedRows, regionCount, stateCount, countyCount] = await Promise.all([
      GeoMalha.aggregate([{ $group: { _id: '$kind', count: { $sum: 1 } } }]),
      Region.countDocuments(notDeleted()),
      State.countDocuments(notDeleted()),
      County.countDocuments({ ...notDeleted(), IBGECode: { $nin: [null, ''] } }),
    ]);
    const cached = { region: 0, state: 0, county: 0 };
    for (const row of cachedRows) {
      if (row._id in cached) cached[row._id] = row.count;
    }
    return res.status(200).json({
      cached,
      catalog: { region: regionCount, state: stateCount, county: countyCount },
    });
  } catch (error) {
    return sendServerError(res, error, 'Error reading map cache stats');
  }
}

async function syncMalhas(req, res) {
  const parsed = parseSyncKinds(req.body?.kinds);
  const force = Boolean(req.body?.force);
  const username = req.user?.username || 'anonymous';
  req.actionLogContext = {
    action: 'geo.sync_start',
    resourceType: 'GEO',
    resourceId: 'malhas',
    message: `${username} started geography sync for malhas${force ? ' (force)' : ''}`,
    meta: { source: 'malhas', force, kinds: parsed.kinds },
  };
  if (parsed.error) {
    return sendError(res, 400, parsed.error, ERROR_CODES.VALIDATION);
  }

  try {
    const wrapped = await withUpstreamRequestLog(() =>
      runMalhasSync({
        force,
        kinds: parsed.kinds,
      })
    );
    const result = wrapped.result;
    const failedHard = Boolean(result.failed) && !result.fetched;
    req.actionLogContext = {
      action: 'geo.sync',
      resourceType: 'GEO',
      resourceId: 'malhas',
      message: `${username} geography sync ${failedHard ? 'failed' : result.fetched ? 'updated' : 'skipped'} for Map cache — fetched ${result.fetched}, skipped ${result.skipped}, failed ${result.failed}, ${result.remaining} remaining`,
      meta: {
        source: 'malhas',
        label: 'Map cache',
        force,
        kinds: result.kinds,
        catalog: result.catalog,
        skipped: result.skipped,
        fetched: result.fetched,
        failed: result.failed,
        remaining: result.remaining,
        done: result.done,
        failures: result.failures,
        ...requestLogMeta(wrapped.log),
      },
    };
    return res.status(200).json(result);
  } catch (error) {
    if (error.status === 409) {
      req.actionLogContext = {
        ...req.actionLogContext,
        message: `${username} geography sync conflict for malhas`,
        meta: { source: 'malhas', force, kinds: parsed.kinds, error: error.message },
      };
      return sendError(res, 409, error.message, ERROR_CODES.CONFLICT);
    }
    req.actionLogContext = {
      action: 'geo.sync',
      resourceType: 'GEO',
      resourceId: 'malhas',
      message: `${username} geography sync failed for Map cache (${error.message || 'Sync failed.'})`,
      meta: {
        source: 'malhas',
        force,
        kinds: parsed.kinds,
        error: error.message,
        ...requestLogMeta(error.upstreamRequestLog),
      },
    };
    return sendServerError(res, error, 'Error syncing IBGE map cache');
  }
}

module.exports = {
  getMalha,
  getMalhaStats,
  syncMalhas,
  runMalhasSync,
  clearMalhasCache,
  resetMalhasSyncLock,
  resolveIbgeTarget,
};
