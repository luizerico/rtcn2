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
const { pdfBuffer, pngBuffer, xlsxBuffer } = require('./helpers/fileFixtures');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtcn-analyses-'));
process.env.FILE_STORAGE_TMP_DIR = tmpDir;

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const SUMMARY = 'Eligibility: municipalities.\nDeadline: 2026-12-31.\nBudget: R$ 100000.';

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
      if (method === 'POST' && href.includes('/v1/analyses')) {
        return jsonResponse(202, {
          success: true,
          data: { job_id: JOB_ID, status: 'queued' },
        });
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

    const postCall = fetchSpy.mock.calls.find((call) =>
      String(call[1]?.method || 'GET').toUpperCase() === 'POST'
    );
    expect(postCall).toBeTruthy();
    expect(postCall[1].headers['X-API-Key']).toBe('test-rtcnai-key');
    expect(postCall[1].headers.Authorization).toBeUndefined();
    const body = JSON.parse(postCall[1].body);
    expect(body.provider).toBe('tmp');
    expect(body.uri).toMatch(/^opportunity\//);
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
  });
});
