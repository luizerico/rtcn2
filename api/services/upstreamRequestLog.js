const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();
const MAX_UNIQUE_REQUESTS = 50;

function describeUpstreamUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl));
    const params = {};
    parsed.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return {
      url: `${parsed.origin}${parsed.pathname}`,
      params,
    };
  } catch {
    return { url: String(rawUrl || ''), params: {} };
  }
}

function noteUpstreamRequest(rawUrl) {
  const bucket = storage.getStore();
  if (!Array.isArray(bucket)) return;
  bucket.push(describeUpstreamUrl(rawUrl));
}

function summarizeUpstreamRequests(requests = []) {
  const unique = [];
  const seen = new Set();
  for (const item of requests) {
    const url = item?.url || '';
    const params = item?.params && typeof item.params === 'object' ? item.params : {};
    const key = `${url}\0${JSON.stringify(params)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ url, params });
  }
  return {
    requestCount: requests.length,
    uniqueRequestCount: unique.length,
    requests: unique.slice(0, MAX_UNIQUE_REQUESTS),
    requestsTruncated: unique.length > MAX_UNIQUE_REQUESTS,
  };
}

function requestLogMeta(log) {
  const summary =
    log && typeof log === 'object' ? log : { requestCount: 0, uniqueRequestCount: 0, requests: [], requestsTruncated: false };
  return {
    requestCount: Number(summary.requestCount) || 0,
    uniqueRequestCount: Number(summary.uniqueRequestCount) || 0,
    requestsTruncated: Boolean(summary.requestsTruncated),
    requests: Array.isArray(summary.requests) ? summary.requests : [],
  };
}

async function withUpstreamRequestLog(fn) {
  const existing = storage.getStore();
  if (Array.isArray(existing)) return fn();
  const bucket = [];
  try {
    const result = await storage.run(bucket, fn);
    return { result, log: summarizeUpstreamRequests(bucket) };
  } catch (error) {
    error.upstreamRequestLog = summarizeUpstreamRequests(bucket);
    throw error;
  }
}

module.exports = {
  MAX_UNIQUE_REQUESTS,
  describeUpstreamUrl,
  noteUpstreamRequest,
  summarizeUpstreamRequests,
  requestLogMeta,
  withUpstreamRequestLog,
};
