/**
 * @jest-environment node
 *
 * Survey response list must not be an IDOR under allowAnyInstance:
 * instance-scoped SURVEY_RESPONSE:READ only returns granted response ids.
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

describe('Survey response list scoping (IDOR guard)', () => {
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

  it('denies listing responses when the user has no SURVEY_RESPONSE:READ', async () => {
    const survey = await createSurvey(app, adminToken);
    const list = await request(app)
      .get(`/api/surveys/${survey._id}/responses`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(list.status).toBe(403);
  });

  it('allows class-wide SURVEY_RESPONSE:READ to list all responses for a survey', async () => {
    const Group = require('../api/models/Group');
    const { replaceGroupPermissions } = require('../api/services/rbacService');

    const survey = await createSurvey(app, adminToken, 'Open survey');
    const questionId = survey.questions[0].questionId;
    await submitResponse(app, adminToken, survey._id, questionId, 'Yes');
    await submitResponse(app, adminToken, survey._id, questionId, 'No');

    const group = await Group.create({
      name: 'response-readers',
      description: 'Class-wide response read',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'SURVEY_RESPONSE',
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

    const list = await request(app).get(`/api/surveys/${survey._id}/responses`).set(auth);
    expect(list.status).toBe(200);
    expect(list.body.responses).toHaveLength(2);
    expect(list.body.summary.responseCount).toBe(2);
  });

  it('scopes instance SURVEY_RESPONSE:READ so one grant cannot list other responses', async () => {
    const Group = require('../api/models/Group');
    const { replaceGroupPermissions } = require('../api/services/rbacService');

    const surveyA = await createSurvey(app, adminToken, 'Survey A');
    const surveyB = await createSurvey(app, adminToken, 'Survey B');
    const qA = surveyA.questions[0].questionId;
    const qB = surveyB.questions[0].questionId;

    const allowed = await submitResponse(app, adminToken, surveyA._id, qA, 'Yes');
    const sibling = await submitResponse(app, adminToken, surveyA._id, qA, 'No');
    const otherSurvey = await submitResponse(app, adminToken, surveyB._id, qB, 'Yes');

    const group = await Group.create({
      name: 'one-response-reader',
      description: 'Instance read on a single response',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'SURVEY_RESPONSE',
        target: allowed.name || String(allowed._id),
        resourceId: allowed._id,
        permission: 'READ',
      },
    ]);

    const login = await request(app).post('/api/auth/login').send({
      username: viewer.user.username,
      password: viewer.password,
    });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const listA = await request(app).get(`/api/surveys/${surveyA._id}/responses`).set(auth);
    expect(listA.status).toBe(200);
    expect(listA.body.responses).toHaveLength(1);
    expect(String(listA.body.responses[0]._id)).toBe(String(allowed._id));
    expect(listA.body.responses.some((row) => String(row._id) === String(sibling._id))).toBe(
      false
    );
    expect(listA.body.summary.responseCount).toBe(1);

    const listB = await request(app).get(`/api/surveys/${surveyB._id}/responses`).set(auth);
    expect(listB.status).toBe(200);
    expect(listB.body.responses).toHaveLength(0);
    expect(listB.body.summary.responseCount).toBe(0);
    expect(
      listB.body.responses.some((row) => String(row._id) === String(otherSurvey._id))
    ).toBe(false);
  });
});
