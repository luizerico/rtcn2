const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();
const MAX_EVENTS = 40;
const MAX_ERRORS = 20;

function isGeoSyncDebug() {
  const raw = String(process.env.GEO_SYNC_DEBUG || process.env.DEBUG || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function fetchLabel(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.pathname;
  } catch {
    return String(url || '').slice(0, 200);
  }
}

function tagStage(error, stage) {
  if (error && typeof error === 'object' && !error.stage) error.stage = stage;
  return error;
}

function serializeError(error) {
  if (error == null) return null;
  const out = {
    name: error.name || 'Error',
    message: error instanceof Error ? error.message : String(error),
  };
  if (error.status != null) out.status = error.status;
  if (error.code != null) out.code = error.code;
  if (error.stage) out.stage = error.stage;
  return out;
}

function formatDebugError(error) {
  const chunks = [];
  let current = error;
  let depth = 0;
  while (current && depth < 5) {
    if (current instanceof Error) {
      chunks.push(current.stack || `${current.name}: ${current.message}`);
      if (current.status != null) chunks.push(`status: ${current.status}`);
      if (current.code != null) chunks.push(`code: ${current.code}`);
      if (current.stage) chunks.push(`stage: ${current.stage}`);
      current = current.cause;
    } else if (current && typeof current === 'object' && current.message) {
      chunks.push(`${current.name || 'Error'}: ${current.message}`);
      current = current.cause;
    } else {
      try {
        chunks.push(JSON.stringify(current));
      } catch {
        chunks.push(String(current));
      }
      break;
    }
    depth += 1;
  }
  return chunks.join('\n');
}

function getBucket() {
  return storage.getStore();
}

function noteSyncEvent(event) {
  const bucket = getBucket();
  if (!bucket) return;
  if (bucket.events.length >= MAX_EVENTS) {
    bucket.truncated = true;
    return;
  }
  bucket.events.push({
    stage: event.stage,
    label: String(event.label || '').slice(0, 300),
    status: event.status,
    durationMs: event.durationMs,
    error: event.error || undefined,
  });
}

function noteSyncError(error, stage, label, durationMs) {
  tagStage(error, stage);
  const bucket = getBucket();
  const serialized = serializeError(error);
  noteSyncEvent({
    stage,
    label,
    status: 'error',
    durationMs,
    error: serialized?.message,
  });
  if (!bucket) return;
  bucket.lastErrorObject = error;
  if (bucket.errors.length < MAX_ERRORS) {
    bucket.errors.push({
      stage,
      label: String(label || '').slice(0, 300),
      message: serialized?.message,
      status: serialized?.status,
      code: serialized?.code,
    });
  }
}

function logSyncConsole(prefix, error) {
  if (isGeoSyncDebug()) {
    console.error(prefix, error);
    return;
  }
  console.error(prefix, error instanceof Error ? error.message : error);
}

async function runSyncStage(stage, label, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    noteSyncEvent({ stage, label, status: 'ok', durationMs: Date.now() - started });
    return result;
  } catch (error) {
    noteSyncError(error, stage, label, Date.now() - started);
    throw error;
  }
}

function summarizeSyncDebug(bucket) {
  const events = bucket?.events || [];
  const errors = bucket?.errors || [];
  const lastError = errors[errors.length - 1] || null;
  const debug = isGeoSyncDebug();
  const summary = {
    failedStage: lastError?.stage || '',
    stages: events,
    stageErrors: errors,
    stagesTruncated: Boolean(bucket?.truncated),
  };
  if (debug && bucket?.lastErrorObject) {
    summary.debugError = formatDebugError(bucket.lastErrorObject);
  }
  return summary;
}

async function withSyncDebug(fn) {
  const existing = getBucket();
  if (existing) {
    const result = await fn();
    return { result, debug: summarizeSyncDebug(existing) };
  }
  const bucket = { events: [], errors: [], truncated: false, lastErrorObject: null };
  try {
    const result = await storage.run(bucket, fn);
    return { result, debug: summarizeSyncDebug(bucket) };
  } catch (error) {
    error.syncDebug = summarizeSyncDebug(bucket);
    throw error;
  }
}

module.exports = {
  isGeoSyncDebug,
  fetchLabel,
  tagStage,
  formatDebugError,
  noteSyncError,
  logSyncConsole,
  runSyncStage,
  summarizeSyncDebug,
  withSyncDebug,
};
