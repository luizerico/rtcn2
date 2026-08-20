const { HttpError, ERROR_CODES } = require('../utils/httpErrors');
const { recordAction } = require('./actionLogService');

const DEFAULT_RTCNAI_URL = 'http://localhost:8008';
const PROMPT_MAX = 8000;

const DEFAULT_FUNDING_PROMPT =
  'Summarize this funding opportunity document as JSON. Use these keys and omit any key that is not present in the document: summary, purpose, eligibility, dates, budget, submissionMethod, requiredDocuments, restrictions.';

const ANALYZABLE_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function rtcnaiBaseUrl() {
  return String(process.env.RTCNAI_URL || DEFAULT_RTCNAI_URL).replace(/\/$/, '');
}

function rtcnaiApiKey() {
  return String(process.env.RTCNAI_API_KEY || '').trim();
}

function parseAzureAccountName(connectionString) {
  const match = String(connectionString || '').match(/AccountName=([^;]+)/i);
  return match ? String(match[1]).trim() : '';
}

function isAnalyzableMime(mimeType) {
  const mime = String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  return ANALYZABLE_MIME_TYPES.has(mime);
}

function fundingPrompt() {
  const custom = String(process.env.RTCNAI_PROMPT || '').trim();
  const prompt = custom || DEFAULT_FUNDING_PROMPT;
  return prompt.slice(0, PROMPT_MAX);
}

function analysisLocationForStoredFile(doc) {
  const driver = String(doc?.storageDriver || '')
    .toLowerCase()
    .trim();
  const key = String(doc?.storageKey || '').trim();
  if (!key) {
    throw new HttpError(500, 'File is missing a storage key.', { code: ERROR_CODES.CONFIG });
  }

  if (driver === 'tmp') {
    return { provider: 'tmp', uri: key };
  }

  if (driver === 'aws') {
    const bucket = String(process.env.AWS_S3_BUCKET || '').trim();
    if (!bucket) {
      throw new HttpError(500, 'AWS storage is not configured for analysis.', {
        code: ERROR_CODES.CONFIG,
      });
    }
    return { provider: 's3', uri: `s3://${bucket}/${key}` };
  }

  if (driver === 'gcs') {
    const bucket = String(process.env.GCS_BUCKET || '').trim();
    if (!bucket) {
      throw new HttpError(500, 'Google storage is not configured for analysis.', {
        code: ERROR_CODES.CONFIG,
      });
    }
    return { provider: 'gcs', uri: `gs://${bucket}/${key}` };
  }

  if (driver === 'azure') {
    const container = String(process.env.AZURE_STORAGE_CONTAINER || '').trim();
    const account = parseAzureAccountName(process.env.AZURE_STORAGE_CONNECTION_STRING);
    if (!container || !account) {
      throw new HttpError(500, 'Azure storage is not configured for analysis.', {
        code: ERROR_CODES.CONFIG,
      });
    }
    return {
      provider: 'azure',
      uri: `https://${account}.blob.core.windows.net/${container}/${key}`,
    };
  }

  throw new HttpError(400, 'File storage driver cannot be analyzed.', {
    code: ERROR_CODES.VALIDATION,
  });
}

function envelopeMessage(payload, fallback) {
  return (
    payload?.error?.message ||
    payload?.data?.error?.message ||
    payload?.message ||
    fallback
  );
}

function mapUpstreamStatus(status) {
  if (status === 401 || status === 403) return 502;
  if (status >= 400 && status < 600) return status;
  return 502;
}

function describeRtcnaiCall(url, { method = 'GET', body } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { url, method, query: {}, body: summarizeRtcnaiBody(body) };
  }
  const query = {};
  parsed.searchParams.forEach((value, key) => {
    if (key === 'prompt') {
      query.promptLength = String(value || '').length;
      query.promptPreview = String(value || '').slice(0, 240);
      return;
    }
    query[key] = value;
  });
  const jobMatch = parsed.pathname.match(/\/v1\/analyses\/([^/]+)/i);
  return {
    url: `${parsed.origin}${parsed.pathname}`,
    path: parsed.pathname,
    method,
    query,
    body: summarizeRtcnaiBody(body),
    jobId: jobMatch ? decodeURIComponent(jobMatch[1]) : null,
  };
}

function summarizeRtcnaiBody(body) {
  if (body == null) return null;
  if (typeof body !== 'object') return { value: String(body).slice(0, 240) };
  return {
    provider: body.provider || null,
    uri: body.uri || null,
  };
}

function logRtcnaiCall(info, extra = {}) {
  const payload = { ...info, ...extra };
  console.info('[RTCNAI]', payload);
  void recordAction({
    action: 'rtcnai.request',
    resourceType: 'RTCNAI',
    resourceId: extra.jobId || info.jobId || null,
    method: info.method,
    path: info.path || info.url,
    statusCode: extra.statusCode || 0,
    success: extra.success,
    message: extra.message || `${info.method} ${info.path || info.url}`,
    meta: {
      url: info.url,
      query: info.query,
      body: info.body,
      ...extra,
    },
  });
}

async function rtcnaiRequest(path, { method = 'GET', body } = {}) {
  const key = rtcnaiApiKey();
  if (!key) {
    throw new HttpError(503, 'Document analysis is not configured.', { code: ERROR_CODES.CONFIG });
  }

  const url = `${rtcnaiBaseUrl()}${path}`;
  const call = describeRtcnaiCall(url, { method, body });
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-API-Key': key,
  };

  let upstream;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    logRtcnaiCall(call, {
      success: false,
      statusCode: 503,
      message: 'Document analysis service is unreachable.',
      error: error.message,
    });
    throw new HttpError(503, 'Document analysis service is unreachable.', {
      code: ERROR_CODES.UNAVAILABLE,
      cause: error,
    });
  }

  const text = await upstream.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    logRtcnaiCall(call, {
      success: false,
      statusCode: upstream.status,
      message: 'Invalid analysis service response.',
    });
    throw new HttpError(502, 'Invalid analysis service response.', { code: ERROR_CODES.INTERNAL });
  }

  const ok = upstream.ok && payload.success !== false;
  logRtcnaiCall(call, {
    success: ok,
    statusCode: upstream.status,
    message: ok
      ? `${call.method} ${call.path}`
      : envelopeMessage(payload, 'Document analysis request failed.'),
    jobId: payload?.data?.job_id || payload?.data?.jobId || call.jobId,
  });

  if (!ok) {
    throw new HttpError(
      mapUpstreamStatus(upstream.status),
      envelopeMessage(payload, 'Document analysis request failed.'),
      { code: payload?.error?.code || ERROR_CODES.INTERNAL }
    );
  }

  return { status: upstream.status, data: payload.data || {} };
}

async function createAnalysis({ provider, uri, prompt }) {
  const encoded = encodeURIComponent(prompt || fundingPrompt());
  const result = await rtcnaiRequest(
    `/v1/analyses?prompt=${encoded}&response_format=json`,
    {
      method: 'POST',
      body: { provider, uri },
    }
  );
  return result.data;
}

async function getAnalysis(jobId) {
  const result = await rtcnaiRequest(`/v1/analyses/${encodeURIComponent(jobId)}`);
  return result.data;
}

async function getAnalysisStatus(jobId) {
  const result = await rtcnaiRequest(`/v1/analyses/${encodeURIComponent(jobId)}/status`);
  return result.data;
}

async function getQueue() {
  const result = await rtcnaiRequest('/v1/queue');
  return result.data || {};
}

async function cancelAnalysis(jobId) {
  const result = await rtcnaiRequest(`/v1/analyses/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
  return result.data;
}

function queueItems(queue) {
  const queued = Array.isArray(queue?.queued) ? queue.queued : [];
  const running = Array.isArray(queue?.running) ? queue.running : [];
  return [...queued, ...running];
}

function findQueueJob(queue, { jobId, uri } = {}) {
  const items = queueItems(queue);
  const wantedJob = String(jobId || '').trim();
  if (wantedJob) {
    const match = items.find((item) => String(item.job_id || item.jobId || '') === wantedJob);
    if (match) return match;
  }
  const wantedUri = String(uri || '')
    .replace(/\\/g, '/')
    .trim();
  if (!wantedUri) return null;
  return (
    items.find((item) => {
      const itemUri = String(item.uri || '')
        .replace(/\\/g, '/')
        .trim();
      return itemUri === wantedUri || itemUri.endsWith(`/${wantedUri}`);
    }) || null
  );
}

const RESULT_MAX = 50000;

function persistAnalysisResult(result) {
  if (result == null || result === '') return null;
  if (typeof result === 'string') return result.slice(0, RESULT_MAX);
  try {
    return JSON.stringify(result).slice(0, RESULT_MAX);
  } catch {
    return String(result).slice(0, RESULT_MAX);
  }
}

function unwrapAnalysisResult(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;
  if (
    parsed.result != null &&
    (parsed.response_format != null || parsed.responseFormat != null)
  ) {
    return unwrapAnalysisResult(
      typeof parsed.result === 'string' ? coerceAnalysisResult(parsed.result) : parsed.result
    );
  }
  if (!('response_format' in parsed) && !('responseFormat' in parsed)) return parsed;
  const { response_format: _snake, responseFormat: _camel, ...rest } = parsed;
  return Object.keys(rest).length ? rest : parsed;
}

function coerceAnalysisResult(result) {
  if (result == null || result === '') return null;
  if (typeof result === 'object') return result;
  const text = String(result);
  const trimmed = text.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  return text;
}

function parseAnalysisResult(result) {
  return unwrapAnalysisResult(coerceAnalysisResult(result));
}

function analysisResultText(result) {
  const parsed = parseAnalysisResult(result);
  if (parsed == null) return '';
  if (typeof parsed === 'string') return parsed;
  try {
    return JSON.stringify(parsed);
  } catch {
    return String(parsed);
  }
}

module.exports = {
  DEFAULT_FUNDING_PROMPT,
  ANALYZABLE_MIME_TYPES,
  rtcnaiBaseUrl,
  parseAzureAccountName,
  isAnalyzableMime,
  fundingPrompt,
  analysisLocationForStoredFile,
  persistAnalysisResult,
  parseAnalysisResult,
  analysisResultText,
  createAnalysis,
  getAnalysis,
  getAnalysisStatus,
  getQueue,
  findQueueJob,
  cancelAnalysis,
};
