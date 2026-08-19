/**
 * @jest-environment node
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.FILE_STORAGE_DRIVER = 'tmp';
process.env.RTCNAI_URL = 'http://127.0.0.1:8008';
process.env.RTCNAI_API_KEY = 'test-rtcnai-key';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const Group = require('../api/models/Group');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
  createTestApp,
  seedAdminUser,
  seedUnprivilegedUser,
} = require('./helpers/apiTestUtils');
const { replaceGroupPermissions } = require('../api/services/rbacService');
const { resetStorageDriverForTests } = require('../api/services/storage');
const { queryActionLogs, deriveAction } = require('../api/services/actionLogService');
const StoredFile = require('../api/models/StoredFile');
const { pdfBuffer, pngBuffer, xlsxBuffer } = require('./helpers/fileFixtures');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtcn-analyses-'));
process.env.FILE_STORAGE_TMP_DIR = tmpDir;

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const SUMMARY = 'Eligibility: municipalities.\nDeadline: 2026-12-31.\nBudget: R$ 100000.';
const SUCCESS_STATUS_MESSAGE = 'Document analysis completed successfully';

function statusPayload(outcome, extra = {}) {
  return {
    job_id: JOB_ID,
    outcome,
    ok: outcome === 'succeeded',
    summary: extra.summary || (outcome === 'succeeded' ? SUCCESS_STATUS_MESSAGE : 'Job is running'),
    progress: {
      current_step: extra.step || (outcome === 'queued' ? 'queued' : 'persist'),
      completed_steps: extra.completed ?? (outcome === 'queued' ? 1 : 6),
      total_steps: 6,
    },
    warning_count: 0,
    error_count: outcome === 'failed' ? 1 : 0,
    events: extra.events || [],
    error: extra.error || null,
    analysis:
      outcome === 'succeeded'
        ? { model: 'gpt-4o-mini', usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, result_preview: SUMMARY.slice(0, 80) }
        : null,
  };
}

async function login(app, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function createSponsor(app, token) {
  const res = await request(app)
    .post('/api/sponsors')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Nestlé',
      orgEmail: 'falecom@example.com',
      origem: 'emp_com_fins_lucrativos',
      contact: 'Challenge desk',
      phone: '1155084400',
    });
  expect(res.status).toBe(201);
  return res.body;
}

function sampleOpportunity(sponsorId) {
  return {
    name: 'Climate call',
    description: 'Municipal climate finance window',
    sponsor: sponsorId,
    type: 'financial',
    category: 'call',
    eligibility: 'municipal_public_administration',
    website: 'https://example.org/call',
    submissionMethod: 'Online form',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    continuous: false,
    budget: 100000,
    totalBudget: 500000,
    currency: 'R$ BRL',
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function queueItem(extra = {}) {
  const outcome = extra.outcome || 'queued';
  return {
    job_id: extra.jobId || JOB_ID,
    outcome,
    position: extra.position ?? (outcome === 'queued' ? 1 : null),
    provider: 'tmp',
    uri: extra.uri || 'opportunity/x/file.pdf',
    prompt_length: 10,
    current_step: extra.current_step || outcome,
    worker_id: outcome === 'running' ? 'worker-1' : null,
    created_at: new Date().toISOString(),
    started_at: null,
    elapsed_ms: 0,
    status_url: `/v1/analyses/${extra.jobId || JOB_ID}/status`,
    result_url: `/v1/analyses/${extra.jobId || JOB_ID}`,
  };
}

function queuePayload({ queued = [], running = [] } = {}) {
  return {
    counts: {
      queued: queued.length,
      running: running.length,
      succeeded: 0,
      failed: 0,
      total: queued.length + running.length,
    },
    queued,
    running,
  };
}

async function waitForLogs(predicate, { attempts = 30, delayMs = 25 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const result = await queryActionLogs({ limit: 100, sort: 'createdAt', order: 'desc' });
    if (predicate(result.items)) {
      return result.items;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Timed out waiting for action logs.');
}

describe('Opportunity file analyses (RTCNAI)', () => {
  let app;
  let adminToken;
  let viewerToken;
  let viewer;
  let sponsor;
  let opportunity;
  let fetchSpy;

  beforeAll(async () => {
    resetStorageDriverForTests();
    await connectTestDatabase();
    app = createTestApp();
  }, 120000);

  afterAll(async () => {
    await disconnectTestDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clearDatabase();
    await seedAdminUser({
      username: 'admin',
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });
    adminToken = await login(app, 'admin@example.com', 'AdminPassword123!');
    viewer = await seedUnprivilegedUser();
    viewerToken = await login(app, viewer.user.email, viewer.password);
    sponsor = await createSponsor(app, adminToken);
    const created = await request(app)
      .post('/api/opportunities')
      .set({ Authorization: `Bearer ${adminToken}` })
      .send(sampleOpportunity(sponsor._id));
    expect(created.status).toBe(201);
    opportunity = created.body;

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const href = String(url);
      const method = String(options?.method || 'GET').toUpperCase();
      if (method === 'GET' && href.includes('/v1/queue')) {
        return jsonResponse(200, { success: true, data: queuePayload() });
      }
      if (method === 'POST' && href.includes('/cancel')) {
        return jsonResponse(500, { success: false, error: { message: 'Unexpected RTCNAI call' } });
      }
      if (method === 'POST' && href.includes('/v1/analyses')) {
        return jsonResponse(202, {
          success: true,
          data: { job_id: JOB_ID, status: 'queued', status_url: `/v1/analyses/${JOB_ID}/status` },
        });
      }
      if (method === 'GET' && href.includes(`/v1/analyses/${JOB_ID}/status`)) {
        return jsonResponse(200, { success: true, data: statusPayload('succeeded') });
      }
      if (method === 'GET' && href.includes(`/v1/analyses/${JOB_ID}`)) {
        return jsonResponse(200, {
          success: true,
          data: {
            job_id: JOB_ID,
            status: 'succeeded',
            analysis: { model: 'gpt-4o-mini', result: SUMMARY },
          },
        });
      }
      return jsonResponse(500, { success: false, error: { message: 'Unexpected RTCNAI call' } });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  async function uploadPdf() {
    const uploaded = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .attach('file', pdfBuffer(), { filename: 'guidelines.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
    return uploaded.body.items[0];
  }

  it('queues analysis for admin and returns the summary on poll', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const file = await uploadPdf();
    const started = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);
    expect(started.status).toBe(202);
    expect(started.body.jobId).toBe(JOB_ID);
    expect(started.body.status).toBe('queued');
    expect(started.body.file.analysis.jobId).toBe(JOB_ID);

    const polled = await request(app)
      .get(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses/${JOB_ID}`)
      .set(auth);
    expect(polled.status).toBe(200);
    expect(polled.body.status).toBe('succeeded');
    expect(polled.body.summary).toBe(SUMMARY);
    expect(polled.body.file.analysis.result).toBe(SUMMARY);

    const listed = await request(app)
      .get(`/api/opportunities/${opportunity._id}/files`)
      .set(auth);
    expect(listed.body.items[0].analysis.result).toBe(SUMMARY);
    expect(listed.body.items[0].analysis.statusSummary).toBe(SUCCESS_STATUS_MESSAGE);

    const postCalls = fetchSpy.mock.calls.filter(
      (call) => String(call[1]?.method || 'GET').toUpperCase() === 'POST'
    );
    expect(postCalls).toHaveLength(1);
    expect(postCalls[0][1].headers['X-API-Key']).toBe('test-rtcnai-key');
    expect(postCalls[0][1].headers.Authorization).toBeUndefined();
    const body = JSON.parse(postCalls[0][1].body);
    expect(body.provider).toBe('tmp');
    expect(body.uri).toMatch(/^opportunity\//);

    const statusCall = fetchSpy.mock.calls.find((call) => String(call[0]).includes('/status'));
    expect(statusCall).toBeTruthy();
    const queueCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).includes('/v1/queue'));
    expect(queueCalls.length).toBeGreaterThanOrEqual(2);
    const resultCall = fetchSpy.mock.calls.find(
      (call) =>
        String(call[1]?.method || 'GET').toUpperCase() === 'GET' &&
        String(call[0]).includes(`/v1/analyses/${JOB_ID}`) &&
        !String(call[0]).includes('/status')
    );
    expect(resultCall).toBeTruthy();

    const logs = await waitForLogs((items) =>
      items.some((row) => row.action === 'opportunity.analyze' && row.meta?.stage === 'result')
    );
    const resultLog = logs.find((row) => row.meta?.stage === 'result');
    expect(resultLog.success).toBe(true);
    expect(resultLog.message).toBe(SUCCESS_STATUS_MESSAGE);
    expect(resultLog.meta.rtcnaiMessage).toBe(SUCCESS_STATUS_MESSAGE);
    expect(resultLog.meta.result).toBe(SUMMARY);
  });

  it('does not create a second RTCNAI job while one is in progress', async () => {
    let created = false;
    fetchSpy.mockImplementation(async (url, options) => {
      const href = String(url);
      const method = String(options?.method || 'GET').toUpperCase();
      if (method === 'GET' && href.includes('/v1/queue')) {
        return jsonResponse(200, {
          success: true,
          data: queuePayload({
            queued: created ? [queueItem({ outcome: 'queued', position: 1 })] : [],
          }),
        });
      }
      if (method === 'POST' && href.includes('/v1/analyses')) {
        created = true;
        return jsonResponse(202, {
          success: true,
          data: { job_id: JOB_ID, status: 'queued' },
        });
      }
      return jsonResponse(500, { success: false, error: { message: 'Unexpected RTCNAI call' } });
    });

    const auth = { Authorization: `Bearer ${adminToken}` };
    const file = await uploadPdf();
    const first = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);
    expect(first.status).toBe(202);

    const second = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);
    expect(second.status).toBe(202);
    expect(second.body.jobId).toBe(JOB_ID);
    expect(second.body.status).toBe('queued');
    expect(second.body.queuePosition).toBe(1);
    expect(second.body.statusSummary).toMatch(/position 1/);

    const postCalls = fetchSpy.mock.calls.filter(
      (call) => String(call[1]?.method || 'GET').toUpperCase() === 'POST'
    );
    expect(postCalls).toHaveLength(1);
    const statusCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).includes('/status'));
    expect(statusCalls).toHaveLength(0);
  });

  it('reuses a queue job for the same file without creating another', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const file = await uploadPdf();
    const stored = await StoredFile.findById(file._id);
    fetchSpy.mockImplementation(async (url, options) => {
      const href = String(url);
      const method = String(options?.method || 'GET').toUpperCase();
      if (method === 'GET' && href.includes('/v1/queue')) {
        return jsonResponse(200, {
          success: true,
          data: queuePayload({
            queued: [queueItem({ uri: stored.storageKey, position: 3 })],
          }),
        });
      }
      return jsonResponse(500, { success: false, error: { message: 'Unexpected RTCNAI call' } });
    });

    const started = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);
    expect(started.status).toBe(202);
    expect(started.body.jobId).toBe(JOB_ID);
    expect(started.body.queuePosition).toBe(3);
    const postCalls = fetchSpy.mock.calls.filter(
      (call) => String(call[1]?.method || 'GET').toUpperCase() === 'POST'
    );
    expect(postCalls).toHaveLength(0);
  });

  it('polls the queue and skips status while the job is still queued', async () => {
    let created = false;
    fetchSpy.mockImplementation(async (url, options) => {
      const href = String(url);
      const method = String(options?.method || 'GET').toUpperCase();
      if (method === 'GET' && href.includes('/v1/queue')) {
        return jsonResponse(200, {
          success: true,
          data: queuePayload({
            queued: created ? [queueItem({ outcome: 'queued', position: 2 })] : [],
          }),
        });
      }
      if (method === 'POST' && href.includes('/v1/analyses')) {
        created = true;
        return jsonResponse(202, {
          success: true,
          data: { job_id: JOB_ID, status: 'queued' },
        });
      }
      return jsonResponse(500, { success: false, error: { message: 'Unexpected RTCNAI call' } });
    });

    const auth = { Authorization: `Bearer ${adminToken}` };
    const file = await uploadPdf();
    await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);

    const polled = await request(app)
      .get(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses/${JOB_ID}`)
      .set(auth);
    expect(polled.status).toBe(200);
    expect(polled.body.status).toBe('queued');
    expect(polled.body.queuePosition).toBe(2);
    expect(polled.body.statusSummary).toMatch(/position 2/);
    const statusCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).includes('/status'));
    expect(statusCalls).toHaveLength(0);
  });

  it('returns persisted status without a job id so a later visit can resume', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const file = await uploadPdf();
    await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);

    const current = await request(app)
      .get(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);
    expect(current.status).toBe(200);
    expect(current.body.jobId).toBe(JOB_ID);
    expect(current.body.status).toBe('succeeded');
    expect(current.body.summary).toBe(SUMMARY);
  });

  it('denies unprivileged users', async () => {
    const file = await uploadPdf();
    const auth = { Authorization: `Bearer ${viewerToken}` };
    const started = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);
    expect(started.status).toBe(403);

    const polled = await request(app)
      .get(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses/${JOB_ID}`)
      .set(auth);
    expect(polled.status).toBe(403);
  });

  it('allows READ to poll but not to start analysis', async () => {
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const file = await uploadPdf();
    const started = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(adminAuth);
    expect(started.status).toBe(202);

    const group = await Group.create({
      name: 'opp-readers',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'OPPORTUNITY',
        target: opportunity.name,
        resourceId: opportunity._id,
        permission: 'READ',
      },
    ]);
    const token = await login(app, viewer.user.email, viewer.password);
    const auth = { Authorization: `Bearer ${token}` };

    const denied = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);
    expect(denied.status).toBe(403);

    const polled = await request(app)
      .get(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses/${JOB_ID}`)
      .set(auth);
    expect(polled.status).toBe(200);
    expect(polled.body.summary).toBe(SUMMARY);
  });

  it('rejects Excel and image files', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const excel = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set(auth)
      .attach('file', xlsxBuffer(), {
        filename: 'budget.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    expect(excel.status).toBe(201);
    const excelDenied = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${excel.body.items[0]._id}/analyses`)
      .set(auth);
    expect(excelDenied.status).toBe(400);

    const image = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set(auth)
      .attach('file', pngBuffer(), { filename: 'site.png', contentType: 'image/png' });
    expect(image.status).toBe(201);
    const imageDenied = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${image.body.items[0]._id}/analyses`)
      .set(auth);
    expect(imageDenied.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 404 when the file belongs to another opportunity', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const other = await request(app)
      .post('/api/opportunities')
      .set(auth)
      .send({ ...sampleOpportunity(sponsor._id), name: 'Other call' });
    expect(other.status).toBe(201);
    const file = await uploadPdf();
    const missing = await request(app)
      .post(`/api/opportunities/${other.body._id}/files/${file._id}/analyses`)
      .set(auth);
    expect(missing.status).toBe(404);
  });

  it('returns 503 when RTCNAI is unreachable', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));
    const auth = { Authorization: `Bearer ${adminToken}` };
    const file = await uploadPdf();
    const started = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);
    expect(started.status).toBe(503);
    expect(started.body.code).toBe('UNAVAILABLE');

    const logs = await waitForLogs((items) =>
      items.some((row) => row.action === 'opportunity.analyze' && row.success === false)
    );
    const failLog = logs.find((row) => row.action === 'opportunity.analyze' && row.success === false);
    expect(failLog.statusCode).toBe(503);
    expect(failLog.resourceType).toBe('OPPORTUNITY');
    expect(failLog.resourceId).toBe(String(opportunity._id));
    expect(failLog.meta.stage).toBe('connect');
    expect(failLog.meta.fileId).toBe(file._id);
    expect(String(failLog.meta.debugError)).toMatch(/ECONNREFUSED|unreachable/i);
    expect(JSON.stringify(failLog)).not.toMatch(/test-rtcnai-key/);
  });

  it('logs a processing failure when RTCNAI marks the job failed', async () => {
    const failMessage = 'Document analysis failed during extract: Unable to extract document text';
    fetchSpy.mockImplementation(async (url, options) => {
      const href = String(url);
      const method = String(options?.method || 'GET').toUpperCase();
      if (method === 'GET' && href.includes('/v1/queue')) {
        return jsonResponse(200, { success: true, data: queuePayload() });
      }
      if (method === 'POST' && href.includes('/v1/analyses')) {
        return jsonResponse(202, {
          success: true,
          data: { job_id: JOB_ID, status: 'queued' },
        });
      }
      if (method === 'GET' && href.includes(`/v1/analyses/${JOB_ID}/status`)) {
        return jsonResponse(200, {
          success: true,
          data: statusPayload('failed', {
            summary: failMessage,
            step: 'extract',
            completed: 3,
            error: { code: 'ANALYSIS_FAILED', message: 'Unable to extract document text' },
          }),
        });
      }
      return jsonResponse(500, { success: false, error: { message: 'Unexpected RTCNAI call' } });
    });

    const auth = { Authorization: `Bearer ${adminToken}` };
    const file = await uploadPdf();
    const started = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);
    expect(started.status).toBe(202);

    const polled = await request(app)
      .get(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses/${JOB_ID}`)
      .set(auth);
    expect(polled.status).toBe(200);
    expect(polled.body.status).toBe('failed');
    expect(polled.body.statusSummary).toBe(failMessage);

    const resultCalls = fetchSpy.mock.calls.filter(
      (call) =>
        String(call[1]?.method || 'GET').toUpperCase() === 'GET' &&
        String(call[0]).includes(`/v1/analyses/${JOB_ID}`) &&
        !String(call[0]).includes('/status')
    );
    expect(resultCalls).toHaveLength(0);

    const logs = await waitForLogs((items) =>
      items.some(
        (row) =>
          row.action === 'opportunity.analyze' &&
          row.success === false &&
          row.meta?.stage === 'processing'
      )
    );
    const failLog = logs.find(
      (row) => row.action === 'opportunity.analyze' && row.meta?.stage === 'processing'
    );
    expect(failLog.message).toBe(failMessage);
    expect(failLog.meta.rtcnaiMessage).toBe(failMessage);
    expect(failLog.meta.jobId).toBe(JOB_ID);
    expect(failLog.meta.code).toBe('ANALYSIS_FAILED');
  });

  it('marks the job failed when the document is not in the queue', async () => {
    fetchSpy.mockImplementation(async (url, options) => {
      const href = String(url);
      const method = String(options?.method || 'GET').toUpperCase();
      if (method === 'GET' && href.includes('/v1/queue')) {
        return jsonResponse(200, { success: true, data: queuePayload() });
      }
      if (method === 'POST' && href.includes('/v1/analyses')) {
        return jsonResponse(202, {
          success: true,
          data: { job_id: JOB_ID, status: 'queued' },
        });
      }
      if (method === 'GET' && href.includes(`/v1/analyses/${JOB_ID}/status`)) {
        return jsonResponse(404, {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Job not found' },
        });
      }
      return jsonResponse(500, { success: false, error: { message: 'Unexpected RTCNAI call' } });
    });

    const auth = { Authorization: `Bearer ${adminToken}` };
    const file = await uploadPdf();
    const started = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);
    expect(started.status).toBe(202);

    const polled = await request(app)
      .get(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses/${JOB_ID}`)
      .set(auth);
    expect(polled.status).toBe(200);
    expect(polled.body.status).toBe('failed');
    expect(polled.body.error).toBe('Document is not in the analysis queue.');
    expect(polled.body.statusSummary).toBe('Document is not in the analysis queue.');

    const logs = await waitForLogs((items) =>
      items.some(
        (row) =>
          row.action === 'opportunity.analyze' &&
          row.success === false &&
          row.meta?.stage === 'queue'
      )
    );
    const failLog = logs.find(
      (row) => row.action === 'opportunity.analyze' && row.meta?.stage === 'queue'
    );
    expect(failLog.message).toBe('Document is not in the analysis queue.');
    expect(failLog.meta.code).toBe('NOT_IN_QUEUE');
  });

  it('cancels an in-progress job through RTCNAI', async () => {
    let created = false;
    fetchSpy.mockImplementation(async (url, options) => {
      const href = String(url);
      const method = String(options?.method || 'GET').toUpperCase();
      if (method === 'GET' && href.includes('/v1/queue')) {
        return jsonResponse(200, {
          success: true,
          data: queuePayload({
            queued: created ? [queueItem({ outcome: 'queued', position: 1 })] : [],
          }),
        });
      }
      if (method === 'POST' && href.includes(`/v1/analyses/${JOB_ID}/cancel`)) {
        created = false;
        return jsonResponse(200, {
          success: true,
          data: {
            job_id: JOB_ID,
            status: 'cancelled',
            status_url: `/v1/analyses/${JOB_ID}/status`,
            result_url: `/v1/analyses/${JOB_ID}`,
          },
        });
      }
      if (method === 'POST' && href.includes('/v1/analyses')) {
        created = true;
        return jsonResponse(202, {
          success: true,
          data: { job_id: JOB_ID, status: 'queued' },
        });
      }
      return jsonResponse(500, { success: false, error: { message: 'Unexpected RTCNAI call' } });
    });

    const auth = { Authorization: `Bearer ${adminToken}` };
    const file = await uploadPdf();
    const started = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(auth);
    expect(started.status).toBe(202);

    const cancelled = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses/${JOB_ID}/cancel`)
      .set(auth);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect(cancelled.body.statusSummary).toMatch(/cancelled/i);

    const cancelCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).includes('/cancel'));
    expect(cancelCalls).toHaveLength(1);
    expect(String(cancelCalls[0][1]?.method || '').toUpperCase()).toBe('POST');

    const logs = await waitForLogs((items) =>
      items.some(
        (row) =>
          row.action === 'opportunity.analyze' && row.meta?.stage === 'cancel' && row.success === true
      )
    );
    const cancelLog = logs.find((row) => row.meta?.stage === 'cancel');
    expect(cancelLog.meta.jobId).toBe(JOB_ID);
    expect(cancelLog.meta.code).toBe('CANCELLED');
  });

  it('denies cancel without WRITE', async () => {
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const file = await uploadPdf();
    const started = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses`)
      .set(adminAuth);
    expect(started.status).toBe(202);

    const denied = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files/${file._id}/analyses/${JOB_ID}/cancel`)
      .set({ Authorization: `Bearer ${viewerToken}` });
    expect(denied.status).toBe(403);
  });

  it('derives opportunity.analyze for analysis routes', () => {
    expect(
      deriveAction('POST', `/api/opportunities/${opportunity._id}/files/abc/analyses`)
    ).toBe('opportunity.analyze');
    expect(
      deriveAction('GET', `/api/opportunities/${opportunity._id}/files/abc/analyses/${JOB_ID}`)
    ).toBe('opportunity.analyze');
    expect(
      deriveAction('POST', `/api/opportunities/${opportunity._id}/files/abc/analyses/${JOB_ID}/cancel`)
    ).toBe('opportunity.analyze');
  });
});
