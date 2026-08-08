/**
 * @jest-environment node
 *
 * High-risk authorization allow/deny coverage for:
 * - survey response submit/list
 * - permissions ACL read/write
 * - identity admin routes (users / groups / admin password reset)
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
} = require('./helpers/apiTestUtils');
const { replaceGroupPermissions } = require('../api/services/rbacService');

async function login(app, username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeDefined();
  return res.body.token;
}

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

describe('High-risk authz paths', () => {
  let app;
  let adminToken;
  let adminUser;
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

    const seeded = await seedAdminUser({
      username: 'admin',
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });
    adminUser = seeded.adminUser;
    adminToken = await login(app, 'admin', 'AdminPassword123!');

    viewer = await seedUnprivilegedUser({
      username: 'viewer',
      email: 'viewer@example.com',
      password: 'Password123!',
    });
    viewerToken = await login(app, 'viewer', 'Password123!');
  });

  describe('Survey responses', () => {
    it('denies unprivileged users from submitting or listing responses', async () => {
      const survey = await createSurvey(app, adminToken, 'Locked survey');
      const auth = { Authorization: `Bearer ${viewerToken}` };
      const questionId = survey.questions[0].questionId;

      const submit = await request(app)
        .post(`/api/surveys/${survey._id}/responses`)
        .set(auth)
        .send({ answers: [{ questionId, value: 'Yes' }] });
      expect(submit.status).toBe(403);

      const list = await request(app)
        .get(`/api/surveys/${survey._id}/responses`)
        .set(auth);
      expect(list.status).toBe(403);
    });

    it('allows class-wide SURVEY_RESPONSE create/read and denies when only SURVEY is granted', async () => {
      const survey = await createSurvey(app, adminToken, 'Scoped survey');
      const questionId = survey.questions[0].questionId;

      const surveyOnly = await Group.create({
        name: 'survey-authors',
        description: 'Survey CRUD without responses',
        members: [viewer.user._id],
      });
      await replaceGroupPermissions(surveyOnly._id, [
        {
          groupId: surveyOnly._id,
          resourceType: 'SURVEY',
          target: '*',
          resourceId: null,
          permission: 'READ',
        },
        {
          groupId: surveyOnly._id,
          resourceType: 'SURVEY',
          target: '*',
          resourceId: null,
          permission: 'CREATE',
        },
      ]);

      let token = await login(app, 'viewer', 'Password123!');
      let auth = { Authorization: `Bearer ${token}` };

      const deniedSubmit = await request(app)
        .post(`/api/surveys/${survey._id}/responses`)
        .set(auth)
        .send({ answers: [{ questionId, value: 'Yes' }] });
      expect(deniedSubmit.status).toBe(403);

      const deniedList = await request(app)
        .get(`/api/surveys/${survey._id}/responses`)
        .set(auth);
      expect(deniedList.status).toBe(403);

      const responseGroup = await Group.create({
        name: 'response-workers',
        description: 'Can submit and read responses',
        members: [viewer.user._id],
      });
      await replaceGroupPermissions(responseGroup._id, [
        {
          groupId: responseGroup._id,
          resourceType: 'SURVEY_RESPONSE',
          target: '*',
          resourceId: null,
          permission: 'CREATE',
        },
        {
          groupId: responseGroup._id,
          resourceType: 'SURVEY_RESPONSE',
          target: '*',
          resourceId: null,
          permission: 'READ',
        },
      ]);

      token = await login(app, 'viewer', 'Password123!');
      auth = { Authorization: `Bearer ${token}` };

      const submit = await request(app)
        .post(`/api/surveys/${survey._id}/responses`)
        .set(auth)
        .send({ answers: [{ questionId, value: 'Yes' }] });
      expect(submit.status).toBe(201);
      expect(submit.body.kind).toBe('SURVEY_RESPONSE');
      expect(String(submit.body.surveyId)).toBe(String(survey._id));

      const list = await request(app)
        .get(`/api/surveys/${survey._id}/responses`)
        .set(auth);
      expect(list.status).toBe(200);
      expect(list.body.responses).toHaveLength(1);
      expect(list.body.summary.responseCount).toBe(1);
    });

    it('allows admin to submit and list responses', async () => {
      const survey = await createSurvey(app, adminToken, 'Admin survey');
      const auth = { Authorization: `Bearer ${adminToken}` };
      const questionId = survey.questions[0].questionId;

      const submit = await request(app)
        .post(`/api/surveys/${survey._id}/responses`)
        .set(auth)
        .send({ answers: [{ questionId, value: 'No' }] });
      expect(submit.status).toBe(201);

      const list = await request(app)
        .get(`/api/surveys/${survey._id}/responses`)
        .set(auth);
      expect(list.status).toBe(200);
      expect(list.body.responses).toHaveLength(1);
    });

    it('denies response access when only instance SURVEY grant exists (no SURVEY_RESPONSE)', async () => {
      const surveyA = await createSurvey(app, adminToken, 'Survey A');
      const surveyB = await createSurvey(app, adminToken, 'Survey B');

      const limited = await Group.create({
        name: 'survey-a-readers',
        members: [viewer.user._id],
      });
      await replaceGroupPermissions(limited._id, [
        {
          groupId: limited._id,
          resourceType: 'SURVEY',
          target: surveyA.name,
          resourceId: surveyA._id,
          permission: 'READ',
        },
      ]);

      const token = await login(app, 'viewer', 'Password123!');
      const auth = { Authorization: `Bearer ${token}` };

      const listA = await request(app)
        .get(`/api/surveys/${surveyA._id}/responses`)
        .set(auth);
      expect(listA.status).toBe(403);

      const listB = await request(app)
        .get(`/api/surveys/${surveyB._id}/responses`)
        .set(auth);
      expect(listB.status).toBe(403);
    });
  });

  describe('Permissions ACL', () => {
    it('allows admin to read and apply ACL and denies unprivileged users', async () => {
      const survey = await createSurvey(app, adminToken, 'ACL survey');
      const adminAuth = { Authorization: `Bearer ${adminToken}` };
      const viewerAuth = { Authorization: `Bearer ${viewerToken}` };

      const getDenied = await request(app)
        .get('/api/permissions/acl')
        .query({ resourceType: 'SURVEY', resourceIds: survey._id })
        .set(viewerAuth);
      expect(getDenied.status).toBe(403);

      const postDenied = await request(app)
        .post('/api/permissions/acl')
        .set(viewerAuth)
        .send({
          resourceType: 'SURVEY',
          allObjects: false,
          objects: [{ id: survey._id, label: survey.name }],
          entries: [
            {
              principalType: 'USER',
              principalId: String(viewer.user._id),
              scopes: ['READ'],
            },
          ],
        });
      expect(postDenied.status).toBe(403);

      const catalogDenied = await request(app)
        .get('/api/permissions/catalog')
        .set(viewerAuth);
      expect(catalogDenied.status).toBe(403);

      const listDenied = await request(app).get('/api/permissions').set(viewerAuth);
      expect(listDenied.status).toBe(403);

      const apply = await request(app)
        .post('/api/permissions/acl')
        .set(adminAuth)
        .send({
          resourceType: 'SURVEY',
          allObjects: false,
          objects: [{ id: survey._id, label: survey.name }],
          entries: [
            {
              principalType: 'USER',
              principalId: String(viewer.user._id),
              scopes: ['READ'],
            },
          ],
        });
      expect(apply.status).toBe(200);
      expect(apply.body.acl.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            principalType: 'USER',
            principalId: String(viewer.user._id),
            scopes: expect.arrayContaining(['READ']),
          }),
        ])
      );

      const getAllowed = await request(app)
        .get('/api/permissions/acl')
        .query({ resourceType: 'SURVEY', resourceIds: survey._id })
        .set(adminAuth);
      expect(getAllowed.status).toBe(200);
      expect(getAllowed.body.entries.length).toBeGreaterThan(0);

      const catalog = await request(app).get('/api/permissions/catalog').set(adminAuth);
      expect(catalog.status).toBe(200);
      expect(catalog.body.resourceTypes).toEqual(expect.arrayContaining(['SURVEY']));
    });
  });

  describe('Identity admin routes', () => {
    it('denies unprivileged users and allows admin for users/groups', async () => {
      const viewerAuth = { Authorization: `Bearer ${viewerToken}` };
      const adminAuth = { Authorization: `Bearer ${adminToken}` };

      const denied = await Promise.all([
        request(app).get('/api/users').set(viewerAuth),
        request(app).get(`/api/users/${adminUser._id}`).set(viewerAuth),
        request(app)
          .post('/api/users')
          .set(viewerAuth)
          .send({
            username: 'blocked',
            email: 'blocked@example.com',
            password: 'Password123!',
          }),
        request(app)
          .put(`/api/users/${viewer.user._id}`)
          .set(viewerAuth)
          .send({ email: 'hacked@example.com' }),
        request(app).delete(`/api/users/${viewer.user._id}`).set(viewerAuth),
        request(app).get('/api/groups').set(viewerAuth),
        request(app)
          .post('/api/groups')
          .set(viewerAuth)
          .send({ name: 'rogue' }),
      ]);

      for (const res of denied) {
        expect(res.status).toBe(403);
      }

      const listUsers = await request(app).get('/api/users').set(adminAuth);
      expect(listUsers.status).toBe(200);
      expect(listUsers.body.items.some((u) => u.username === 'viewer')).toBe(true);

      const createGroup = await request(app)
        .post('/api/groups')
        .set(adminAuth)
        .send({ name: 'ops', description: 'Ops team' });
      expect(createGroup.status).toBe(201);

      const addMember = await request(app)
        .post(`/api/groups/${createGroup.body._id}/members`)
        .set(adminAuth)
        .send({ targetUserId: viewer.user._id });
      expect(addMember.status).toBe(200);

      const memberDenied = await request(app)
        .post(`/api/groups/${createGroup.body._id}/members`)
        .set(viewerAuth)
        .send({ targetUserId: adminUser._id });
      expect(memberDenied.status).toBe(403);
    });

    it('allows admin password reset and denies unprivileged callers', async () => {
      const denied = await request(app)
        .post(`/api/users/${viewer.user._id}/password`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ newPassword: 'HackedPass123!' });
      expect(denied.status).toBe(403);

      const allowed = await request(app)
        .post(`/api/users/${viewer.user._id}/password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'ViewerNewPass123!' });
      expect(allowed.status).toBe(200);

      const oldLogin = await request(app).post('/api/auth/login').send({
        username: 'viewer',
        password: 'Password123!',
      });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app).post('/api/auth/login').send({
        username: 'viewer',
        password: 'ViewerNewPass123!',
      });
      expect(newLogin.status).toBe(200);
    });
  });
});
