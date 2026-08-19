const { HttpError, ERROR_CODES } = require('../utils/httpErrors');

const DEFAULT_RTCNAI_URL = 'http://localhost:8008';
const PROMPT_MAX = 8000;

const DEFAULT_FUNDING_PROMPT =
  'Summarize this funding opportunity document. Return a short summary, then a structured list of relevant points covering: purpose, eligibility, dates and deadlines, budget and funding amounts, submission method, required documents, and any restrictions or special conditions. Omit any point that is not present in the document.';

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

async function rtcnaiRequest(path, { method = 'GET', body } = {}) {
  const key = rtcnaiApiKey();
  if (!key) {
    throw new HttpError(503, 'Document analysis is not configured.', { code: ERROR_CODES.CONFIG });
  }

  const url = `${rtcnaiBaseUrl()}${path}`;
  const headers = {
    Accept: 'application/json',
    'X-API-Key': key,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let upstream;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
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
    throw new HttpError(502, 'Invalid analysis service response.', { code: ERROR_CODES.INTERNAL });
  }

  if (!upstream.ok || payload.success === false) {
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
  const result = await rtcnaiRequest(`/v1/analyses?prompt=${encoded}`, {
    method: 'POST',
    body: { provider, uri },
  });
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

module.exports = {
  DEFAULT_FUNDING_PROMPT,
  ANALYZABLE_MIME_TYPES,
  rtcnaiBaseUrl,
  parseAzureAccountName,
  isAnalyzableMime,
  fundingPrompt,
  analysisLocationForStoredFile,
  createAnalysis,
  getAnalysis,
  getAnalysisStatus,
  getQueue,
  findQueueJob,
  cancelAnalysis,
};
