/**
 * @jest-environment node
 *
 * Instrument responses are authorized by COUNTY or associated asset RBAC:
 * - SURVEY:READ + subject CREATE starts a sheet
 * - COUNTY:READ / PROJECT:READ sees that subject's sheet
 * - COUNTY:WRITE / PROJECT:WRITE edits an existing sheet
 * - Owners can edit while in_progress or need_changes
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

async function createSurvey(app, token, name = 'Pulse', extra = {}) {
  const res = await request(app)
    .post('/api/surveys')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name,
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      ...extra,
    });
  expect(res.status).toBe(201);
  return res.body;
}

describe('Survey response access (subject RBAC)', () => {
  let app;
  let adminToken;
  let viewer;
  let viewerToken;
  let county;

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
    const adminLogin = await request(app).post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;

    viewer = await seedUnprivilegedUser();
    const viewerLogin = await request(app).post('/api/auth/login').send({
      email: viewer.user.email,
      password: viewer.password,
    });
    expect(viewerLogin.status).toBe(200);
    viewerToken = viewerLogin.body.token;
    ({ county } = await seedCounty());
  });

  it('denies listing responses without SURVEY:READ', async () => {
    const survey = await createSurvey(app, adminToken);
    const list = await request(app)
      .get(`/api/surveys/${survey._id}/responses`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(list.status).toBe(403);
  });

  it('denies filling without county or asset access even with SURVEY:READ', async () => {
    const survey = await createSurvey(app, adminToken, 'Open survey', {
      countyIds: [county._id],
    });
    const questionId = survey.questions[0].questionId;

    const group = await Group.create({
      name: 'survey-readers',
      description: 'Can read instrument definitions',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'SURVEY',
        target: '*',
        resourceId: null,
        permission: 'READ',
      },
    ]);

    const login = await request(app).post('/api/auth/login').send({
      email: viewer.user.email,
      password: viewer.password,
    });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const submit = await request(app)
      .post(`/api/surveys/${survey._id}/responses`)
      .set(auth)
      .send({
        subjectType: 'COUNTY',
        subjectId: county._id,
        answers: [{ questionId, value: 'Yes' }],
      });
    expect(submit.status).toBe(403);

    const list = await request(app).get(`/api/surveys/${survey._id}/responses`).set(auth);
    expect(list.status).toBe(200);
    expect(list.body.responses).toHaveLength(0);
  });

  it('lists accessible answers for COUNTY:READ and rejects fill with only READ', async () => {
    const survey = await createSurvey(app, adminToken, 'Visible survey', {
      countyIds: [county._id],
    });
    const questionId = survey.questions[0].questionId;
    await request(app)
      .put(`/api/surveys/${survey._id}/subjects/COUNTY/${county._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ answers: [{ questionId, value: 'Yes' }], status: 'in_progress' });

    const group = await Group.create({
      name: 'county-readers',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'READ',
      },
    ]);
    const login = await request(app).post('/api/auth/login').send({
      email: viewer.user.email,
      password: viewer.password,
    });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const answers = await request(app).get('/api/surveys/answers').set(auth);
    expect(answers.status).toBe(200);
    expect(answers.body.items).toHaveLength(1);

    const fill = await request(app)
      .put(`/api/surveys/${survey._id}/subjects/COUNTY/${county._id}`)
      .set(auth)
      .send({ answers: [{ questionId, value: 'No' }] });
    expect(fill.status).toBe(403);
  });

  it('allows admin to list responses for a survey', async () => {
    const { county: other } = await seedCounty({ name: 'Otherville' });
    const survey = await createSurvey(app, adminToken, 'Admin results', {
      countyIds: [county._id, other._id],
    });
    const questionId = survey.questions[0].questionId;
    await request(app)
      .post(`/api/surveys/${survey._id}/responses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectType: 'COUNTY',
        subjectId: county._id,
        answers: [{ questionId, value: 'Yes' }],
      });
    await request(app)
      .post(`/api/surveys/${survey._id}/responses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectType: 'COUNTY',
        subjectId: other._id,
        answers: [{ questionId, value: 'No' }],
      });

    const list = await request(app)
      .get(`/api/surveys/${survey._id}/responses`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.responses).toHaveLength(2);
    expect(list.body.summary.responseCount).toBe(2);
  });
});
