/**
 * @jest-environment node
 *
 * Survey responses are not RBAC resources:
 * - SURVEY:READ may submit answers
 * - Only admin-group members may list results
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
  createTestApp,
  seedAdminUser,
  seedUnprivilegedUser,
} = require('./helpers/apiTestUtils');

async function createSurvey(app, token, name = 'Pulse') {
  const res = await request(app)
    .post('/api/surveys')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name,
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
    });
  expect(res.status).toBe(201);
  return res.body;
}

async function submitResponse(app, token, surveyId, questionId, value) {
  const res = await request(app)
    .post(`/api/surveys/${surveyId}/responses`)
    .set('Authorization', `Bearer ${token}`)
    .send({ answers: [{ questionId, value }] });
  expect(res.status).toBe(201);
  return res.body;
}

describe('Survey response access (no SURVEY_RESPONSE RBAC)', () => {
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
    const adminLogin = await request(app).post('/api/auth/login').send({
      username: 'admin',
      password: 'AdminPassword123!',
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;

    viewer = await seedUnprivilegedUser();
    const viewerLogin = await request(app).post('/api/auth/login').send({
      username: viewer.user.username,
      password: viewer.password,
    });
    expect(viewerLogin.status).toBe(200);
    viewerToken = viewerLogin.body.token;
  });

  it('denies listing responses for non-admin users', async () => {
    const survey = await createSurvey(app, adminToken);
    const list = await request(app)
      .get(`/api/surveys/${survey._id}/responses`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(list.status).toBe(403);
  });

  it('allows SURVEY:READ to submit answers but still denies results to non-admins', async () => {
    const Group = require('../api/models/Group');
    const { replaceGroupPermissions } = require('../api/services/rbacService');

    const survey = await createSurvey(app, adminToken, 'Open survey');
    const questionId = survey.questions[0].questionId;

    const group = await Group.create({
      name: 'survey-readers',
      description: 'Can read and answer surveys',
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
      username: viewer.user.username,
      password: viewer.password,
    });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    await submitResponse(app, login.body.token, survey._id, questionId, 'Yes');

    const list = await request(app).get(`/api/surveys/${survey._id}/responses`).set(auth);
    expect(list.status).toBe(403);
  });

  it('allows admin to list all responses for a survey', async () => {
    const survey = await createSurvey(app, adminToken, 'Admin results');
    const questionId = survey.questions[0].questionId;
    await submitResponse(app, adminToken, survey._id, questionId, 'Yes');
    await submitResponse(app, adminToken, survey._id, questionId, 'No');

    const list = await request(app)
      .get(`/api/surveys/${survey._id}/responses`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.responses).toHaveLength(2);
    expect(list.body.summary.responseCount).toBe(2);
  });
});
