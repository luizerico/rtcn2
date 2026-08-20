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
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
  createTestApp,
  seedAdminUser,
  seedUnprivilegedUser,
  seedCounty,
} = require('./helpers/apiTestUtils');
const { resetStorageDriverForTests } = require('../api/services/storage');
const { queryActionLogs } = require('../api/services/actionLogService');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtcn-matches-'));
process.env.FILE_STORAGE_TMP_DIR = tmpDir;

const JOB_ID = '22222222-2222-4222-8222-222222222222';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
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
      name: 'Match Sponsor',
      orgEmail: 'sponsor@example.com',
      origem: 'gov_federal',
      contact: 'Desk',
      phone: '1100000000',
    });
  expect(res.status).toBe(201);
  return res.body;
}

function sampleOpportunity(sponsorId) {
  return {
    name: 'Climate adaptation call',
    description: 'Funds municipal climate risk maps',
    sponsor: sponsorId,
    type: 'financial',
    category: 'call',
    eligibility: 'municipal_public_administration',
    website: 'https://example.org/call',
    submissionMethod: 'Online form',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    continuous: false,
    budget: 250000,
    currency: 'R$ BRL',
  };
}

async function seedApprovedSheet(app, auth, county) {
  const created = await request(app).post('/api/surveys').set(auth).send({
    name: 'Climate diagnostic',
    questions: [
      {
        code: 'MC1',
        area: 'MC',
        prompt: 'Climate policy?',
        type: 'score',
        maxPoints: 2,
        todo: 'Establish climate policy',
      },
      {
        code: 'MC2',
        area: 'MC',
        prompt: 'Risk map?',
        type: 'score',
        maxPoints: 2,
        todo: 'Map climate risk',
      },
    ],
    countyIds: [county._id],
  });
  expect(created.status).toBe(201);
  const questions = created.body.questions;
  const pathUrl = `/api/surveys/${created.body._id}/subjects/COUNTY/${county._id}`;
  const sheet = await request(app)
    .put(pathUrl)
    .set(auth)
    .send({
      status: 'approved',
      answers: [
        { questionId: questions[0].questionId, value: 0 },
        { questionId: questions[1].questionId, value: 2 },
      ],
    });
  expect(sheet.status).toBe(200);
  return { survey: created.body, questions, sheet: sheet.body };
}

describe('Opportunity county matches (RTCNAI)', () => {
  let app;
  let adminToken;
  let viewerToken;
  let fetchSpy;
  let analysisResult;

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
    analysisResult = '{"counties":[]}';
    await clearDatabase();
    await seedAdminUser({
      username: 'admin',
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });
    adminToken = await login(app, 'admin@example.com', 'AdminPassword123!');
    const viewer = await seedUnprivilegedUser();
    viewerToken = await login(app, viewer.user.email, viewer.password);

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const href = String(url);
      const method = String(options?.method || 'GET').toUpperCase();
      if (method === 'GET' && href.includes('/v1/queue')) {
        return jsonResponse(200, { success: true, data: queuePayload() });
      }
      if (method === 'POST' && href.includes('/cancel')) {
        return jsonResponse(200, { success: true, data: { job_id: JOB_ID, status: 'cancelled' } });
      }
      if (method === 'POST' && href.includes('/v1/analyses')) {
        return jsonResponse(202, {
          success: true,
          data: { job_id: JOB_ID, status: 'queued', status_url: `/v1/analyses/${JOB_ID}/status` },
        });
      }
      if (method === 'GET' && href.includes(`/v1/analyses/${JOB_ID}/status`)) {
        return jsonResponse(200, {
          success: true,
          data: {
            job_id: JOB_ID,
            outcome: 'succeeded',
            ok: true,
            summary: 'Document analysis completed successfully',
            progress: { current_step: 'persist', completed_steps: 6, total_steps: 6 },
          },
        });
      }
      if (method === 'GET' && href.includes(`/v1/analyses/${JOB_ID}`)) {
        return jsonResponse(200, {
          success: true,
          data: {
            job_id: JOB_ID,
            status: 'succeeded',
            analysis: { model: 'gpt-4o-mini', result: analysisResult },
          },
        });
      }
      return jsonResponse(500, { success: false, error: { message: 'Unexpected RTCNAI call' } });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('denies unprivileged users for prompts, runs, and opportunity matches', async () => {
    const prompts = await request(app)
      .get('/api/admin/ai-prompts')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(prompts.status).toBe(403);

    const listed = await request(app)
      .get('/api/opportunity-matches')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(listed.status).toBe(403);

    const run = await request(app)
      .post('/api/opportunity-matches')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ opportunityIds: ['000000000000000000000000'], mode: 'shallow' });
    expect(run.status).toBe(403);
  });

  it('lets admin customize prompts and correlate an opportunity to a surveyed county', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const { county } = await seedCounty({ name: 'Rivertown' });
    await require('../api/models/geo/County').findByIdAndUpdate(county._id, { population: 80000 });
    const { questions } = await seedApprovedSheet(app, auth, county);
    const sponsor = await createSponsor(app, adminToken);
    const opportunity = await request(app).post('/api/opportunities').set(auth).send(sampleOpportunity(sponsor._id));
    expect(opportunity.status).toBe(201);

    const listed = await request(app).get('/api/admin/ai-prompts').set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.items.length).toBe(3);

    const updated = await request(app)
      .put('/api/admin/ai-prompts')
      .set(auth)
      .send({
        items: [{ key: 'opportunity_match_shallow', body: listed.body.items[0].body }],
      });
    expect(updated.status).toBe(200);

    analysisResult = {
      counties: [
        {
          countyId: String(county._id),
          matchedCodes: [
            {
              code: 'MC1',
              questionId: questions[0].questionId,
              proposedScore: 2,
              reason: 'Call funds climate policy',
            },
          ],
          dimensions: {
            biome: { score: 7, note: 'Relevant biome' },
            region: { score: 6, note: 'Regional fit' },
            riskReduction: { score: 8, note: 'Risk maps' },
          },
          rationale: 'Closes the climate policy gap.',
        },
      ],
    };

    const started = await request(app)
      .post('/api/opportunity-matches')
      .set(auth)
      .send({ opportunityIds: [opportunity.body._id], mode: 'shallow' });
    expect(started.status).toBe(202);
    expect(started.body.status).toMatch(/queued|running/);
    expect(started.body.steps.length).toBeGreaterThan(0);

    const polled = await request(app)
      .get(`/api/opportunity-matches/${started.body._id}`)
      .set(auth);
    expect(polled.status).toBe(200);
    expect(polled.body.status).toBe('succeeded');
    expect(polled.body.matches).toHaveLength(1);
    expect(polled.body.matches[0].countyName).toBe('Rivertown');
    expect(polled.body.matches[0].gradeBefore.letter).toBe('C');
    expect(polled.body.matches[0].gradeAfter.letter).toBe('A');
    expect(polled.body.matches[0].overallScore).toBeGreaterThan(0);
    expect(polled.body.steps[0].prompt).toBeTruthy();
    expect(polled.body.steps[0].request.query.response_format).toBe('json');
    expect(polled.body.steps[0].requestPayload.task).toBe('opportunity_county_match');
    expect(polled.body.steps[0].rawResult).toEqual(analysisResult);

    const analysisPosts = fetchSpy.mock.calls.filter(
      (call) =>
        String(call[1]?.method || 'GET').toUpperCase() === 'POST' &&
        String(call[0]).includes('/v1/analyses') &&
        !String(call[0]).includes('/cancel')
    );
    expect(analysisPosts).toHaveLength(1);

    const polledAgain = await request(app)
      .get(`/api/opportunity-matches/${started.body._id}`)
      .set(auth);
    expect(polledAgain.status).toBe(200);
    expect(
      fetchSpy.mock.calls.filter(
        (call) =>
          String(call[1]?.method || 'GET').toUpperCase() === 'POST' &&
          String(call[0]).includes('/v1/analyses') &&
          !String(call[0]).includes('/cancel')
      )
    ).toHaveLength(1);

    const allRuns = await request(app).get('/api/opportunity-matches').set(auth);
    expect(allRuns.status).toBe(200);
    expect(allRuns.body.items).toHaveLength(1);
    expect(allRuns.body.items[0]._id).toBe(started.body._id);
    expect(allRuns.body.pagination.total).toBe(1);

    const rtcnaiLogs = await queryActionLogs({ action: 'rtcnai.request', limit: 50 });
    expect(rtcnaiLogs.items.length).toBeGreaterThan(0);
    expect(
      rtcnaiLogs.items.some(
        (row) =>
          row.meta?.query?.response_format === 'json' ||
          String(row.path || '').includes('/v1/analyses')
      )
    ).toBe(true);

    const forOpp = await request(app)
      .get(`/api/opportunities/${opportunity.body._id}/matches`)
      .set(auth);
    expect(forOpp.status).toBe(200);
    expect(forOpp.body.latest.matches).toHaveLength(1);
    expect(forOpp.body.history).toHaveLength(1);
    expect(forOpp.body.history[0]._id).toBe(started.body._id);

    const viewerMatches = await request(app)
      .get(`/api/opportunities/${opportunity.body._id}/matches`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerMatches.status).toBe(403);

    const createdProject = await request(app)
      .post(
        `/api/opportunities/${opportunity.body._id}/matches/${started.body._id}/counties/${county._id}/project`
      )
      .set(auth);
    expect(createdProject.status).toBe(201);
    expect(createdProject.body.opportunity).toBe(opportunity.body._id);
    expect(createdProject.body.relatedEntity.entityType).toBe('county');
    expect(createdProject.body.projStatus).toBe('draft');

    const viewerProject = await request(app)
      .post(
        `/api/opportunities/${opportunity.body._id}/matches/${started.body._id}/counties/${county._id}/project`
      )
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerProject.status).toBe(403);
  });
});
