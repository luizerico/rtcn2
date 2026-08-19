/**
 * @jest-environment node
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const Group = require('../api/models/Group');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
  createTestApp,
  seedAdminUser,
  seedUnprivilegedUser,
  seedCounty,
} = require('./helpers/apiTestUtils');
const { replaceGroupPermissions } = require('../api/services/rbacService');

async function login(app, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function seedApprovedSheet(app, auth, county, answerFn) {
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
  const path = `/api/surveys/${created.body._id}/subjects/COUNTY/${county._id}`;
  const sheet = await request(app)
    .put(path)
    .set(auth)
    .send({
      status: 'approved',
      answers: answerFn(questions),
    });
  expect(sheet.status).toBe(200);
  return { survey: created.body, questions, sheet: sheet.body, path };
}

describe('Local plans', () => {
  let app;
  let adminToken;
  let viewer;
  let viewerToken;

  beforeAll(async () => {
    await connectTestDatabase();
    app = createTestApp();
  }, 120000);

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    await seedAdminUser({
      username: 'admin',
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });
    adminToken = await login(app, 'admin@example.com', 'AdminPassword123!');
    viewer = await seedUnprivilegedUser({
      username: 'viewer',
      email: 'viewer@example.com',
      password: 'Password123!',
    });
    viewerToken = await login(app, 'viewer@example.com', 'Password123!');
  });

  it('lets admin create from approved gaps and denies unprivileged users', async () => {
    const { county } = await seedCounty();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const { questions, sheet, survey } = await seedApprovedSheet(app, auth, county, (qs) => [
      { questionId: qs[0].questionId, value: 0 },
      { questionId: qs[1].questionId, value: 2 },
    ]);

    const denied = await request(app)
      .post('/api/localplans')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ instrumentResponseId: sheet._id, inclusionMode: 'gaps' });
    expect(denied.status).toBe(403);

    const preview = await request(app).get('/api/localplans/preview').set(auth).query({
      instrumentResponseId: sheet._id,
      inclusionMode: 'gaps',
    });
    expect(preview.status).toBe(200);
    expect(preview.body.items.map((row) => row.code)).toEqual(['MC1']);

    const created = await request(app)
      .post('/api/localplans')
      .set(auth)
      .send({ instrumentResponseId: sheet._id, inclusionMode: 'gaps' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('default');
    expect(created.body.surveyId).toBe(survey._id);
    expect(created.body.entries).toHaveLength(1);
    expect(created.body.entries[0].code).toBe('MC1');
    expect(created.body.entries[0].todo).toBe('Establish climate policy');
    expect(created.body.entries[0].technicalPriority.term).toBeTruthy();

    const listed = await request(app).get('/api/localplans').set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);

    const viewerList = await request(app)
      .get('/api/localplans')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerList.status).toBe(403);

    const selected = await request(app)
      .post('/api/localplans')
      .set(auth)
      .send({
        instrumentResponseId: sheet._id,
        inclusionMode: 'selected',
        questionIds: [questions[1].questionId],
      });
    expect(selected.status).toBe(201);
    expect(selected.body.status).toBe('draft');
    expect(selected.body.entries.map((row) => row.code)).toEqual(['MC2']);
  });

  it('rejects create from a sheet that is not approved', async () => {
    const { county } = await seedCounty();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const created = await request(app).post('/api/surveys').set(auth).send({
      name: 'Draft sheet',
      questions: [{ code: 'MC1', area: 'MC', prompt: 'Q', type: 'score', maxPoints: 2 }],
      countyIds: [county._id],
    });
    const questionId = created.body.questions[0].questionId;
    const sheet = await request(app)
      .put(`/api/surveys/${created.body._id}/subjects/COUNTY/${county._id}`)
      .set(auth)
      .send({ answers: [{ questionId, value: 0 }] });
    expect(sheet.body.status).toBe('in_progress');
    const res = await request(app)
      .post('/api/localplans')
      .set(auth)
      .send({ instrumentResponseId: sheet.body._id, inclusionMode: 'gaps' });
    expect(res.status).toBe(400);
  });

  it('promotes one default and keeps drafts frozen while syncing the default plan', async () => {
    const { county } = await seedCounty();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const { questions, sheet, path } = await seedApprovedSheet(app, auth, county, (qs) => [
      { questionId: qs[0].questionId, value: 0 },
      { questionId: qs[1].questionId, value: 2 },
    ]);

    const first = await request(app)
      .post('/api/localplans')
      .set(auth)
      .send({ instrumentResponseId: sheet._id, inclusionMode: 'gaps' });
    expect(first.body.status).toBe('default');
    expect(first.body.entries.map((row) => row.code)).toEqual(['MC1']);

    const draft = await request(app)
      .post('/api/localplans')
      .set(auth)
      .send({ instrumentResponseId: sheet._id, inclusionMode: 'all' });
    expect(draft.body.status).toBe('draft');
    expect(draft.body.entries).toHaveLength(2);

    const promoted = await request(app).post(`/api/localplans/${draft.body._id}/default`).set(auth);
    expect(promoted.status).toBe(200);
    expect(promoted.body.status).toBe('default');

    const previous = await request(app).get(`/api/localplans/${first.body._id}`).set(auth);
    expect(previous.body.status).toBe('draft');

    const demotedAgain = await request(app)
      .post(`/api/localplans/${first.body._id}/default`)
      .set(auth);
    expect(demotedAgain.body.status).toBe('default');

    const updatedSheet = await request(app)
      .put(path)
      .set(auth)
      .send({
        status: 'approved',
        answers: [
          { questionId: questions[0].questionId, value: 2 },
          { questionId: questions[1].questionId, value: 0 },
        ],
      });
    expect(updatedSheet.status).toBe(200);

    const synced = await request(app).get(`/api/localplans/${first.body._id}`).set(auth);
    expect(synced.body.entries.map((row) => row.code)).toEqual(['MC2']);
    expect(synced.body.sourceRevision).toBe(updatedSheet.body.revision);

    const frozen = await request(app).get(`/api/localplans/${draft.body._id}`).set(auth);
    expect(frozen.body.entries).toHaveLength(2);

    const changes = await request(app).get(`/api/localplans/${first.body._id}/changes`).set(auth);
    expect(changes.status).toBe(200);
    const revisionChange = changes.body.items.find((row) => row.reason === 'survey_revision');
    expect(revisionChange).toBeTruthy();
    expect(revisionChange.added.map((row) => row.code)).toEqual(['MC2']);
    expect(revisionChange.removed.map((row) => row.code)).toEqual(['MC1']);
  });

  it('warns about linked plans and blocks survey purge while they exist', async () => {
    const { county } = await seedCounty();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const { sheet, survey } = await seedApprovedSheet(app, auth, county, (qs) => [
      { questionId: qs[0].questionId, value: 0 },
      { questionId: qs[1].questionId, value: 0 },
    ]);
    const created = await request(app)
      .post('/api/localplans')
      .set(auth)
      .send({ instrumentResponseId: sheet._id, inclusionMode: 'all' });
    expect(created.status).toBe(201);

    const links = await request(app).get(`/api/surveys/${survey._id}/localplan-links`).set(auth);
    expect(links.status).toBe(200);
    expect(links.body.count).toBe(1);

    const trashed = await request(app).delete(`/api/surveys/${survey._id}`).set(auth);
    expect(trashed.status).toBe(200);

    const purge = await request(app).delete(`/api/bin/SURVEY/${survey._id}`).set(auth);
    expect(purge.status).toBe(409);

    await request(app).delete(`/api/localplans/${created.body._id}`).set(auth);
    const purgePlan = await request(app).delete(`/api/bin/LOCALPLAN/${created.body._id}`).set(auth);
    expect(purgePlan.status).toBe(200);

    const purgeSurvey = await request(app).delete(`/api/bin/SURVEY/${survey._id}`).set(auth);
    expect(purgeSurvey.status).toBe(200);
  });

  it('lets COUNTY readers with LOCALPLAN:READ see the default but not drafts', async () => {
    const { county } = await seedCounty();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const { sheet } = await seedApprovedSheet(app, auth, county, (qs) => [
      { questionId: qs[0].questionId, value: 0 },
      { questionId: qs[1].questionId, value: 0 },
    ]);
    const def = await request(app)
      .post('/api/localplans')
      .set(auth)
      .send({ instrumentResponseId: sheet._id, inclusionMode: 'gaps' });
    const draft = await request(app)
      .post('/api/localplans')
      .set(auth)
      .send({ instrumentResponseId: sheet._id, inclusionMode: 'all' });

    const group = await Group.create({ name: 'plan-readers', members: [viewer.user._id] });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'LOCALPLAN',
        target: '*',
        resourceId: null,
        permission: 'READ',
      },
      {
        groupId: group._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'READ',
      },
    ]);
    const token = await login(app, 'viewer@example.com', 'Password123!');
    const header = { Authorization: `Bearer ${token}` };

    const listed = await request(app).get('/api/localplans').set(header);
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((row) => row._id)).toEqual([def.body._id]);

    const openDefault = await request(app).get(`/api/localplans/${def.body._id}`).set(header);
    expect(openDefault.status).toBe(200);

    const openDraft = await request(app).get(`/api/localplans/${draft.body._id}`).set(header);
    expect(openDraft.status).toBe(403);
  });
});
