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
  seedCounty,
} = require('./helpers/apiTestUtils');
const { replaceGroupPermissions } = require('../api/services/rbacService');

async function login(app, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeDefined();
  return res.body.token;
}

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
    adminToken = await login(app, 'admin@example.com', 'AdminPassword123!');

    viewer = await seedUnprivilegedUser({
      username: 'viewer',
      email: 'viewer@example.com',
      password: 'Password123!',
    });
    viewerToken = await login(app, 'viewer@example.com', 'Password123!');
  });

  describe('Survey responses', () => {
    it('denies unprivileged users from submitting or listing responses', async () => {
      const survey = await createSurvey(app, adminToken, 'Locked survey');
      const { county } = await seedCounty();
      const auth = { Authorization: `Bearer ${viewerToken}` };
      const questionId = survey.questions[0].questionId;

      const submit = await request(app)
        .post(`/api/surveys/${survey._id}/responses`)
        .set(auth)
        .send({
          subjectType: 'COUNTY',
          subjectId: county._id,
          answers: [{ questionId, value: 'Yes' }],
        });
      expect(submit.status).toBe(403);

      const list = await request(app)
        .get(`/api/surveys/${survey._id}/responses`)
        .set(auth);
      expect(list.status).toBe(403);
    });

    it('does not treat SURVEY:READ as fill access; results follow subject READ', async () => {
      const survey = await createSurvey(app, adminToken, 'Scoped survey');
      const { county } = await seedCounty();
      const questionId = survey.questions[0].questionId;

      const surveyReaders = await Group.create({
        name: 'survey-readers',
        description: 'Can read instrument definitions',
        members: [viewer.user._id],
      });
      await replaceGroupPermissions(surveyReaders._id, [
        {
          groupId: surveyReaders._id,
          resourceType: 'SURVEY',
          target: '*',
          resourceId: null,
          permission: 'READ',
        },
      ]);

      const token = await login(app, 'viewer@example.com', 'Password123!');
      const auth = { Authorization: `Bearer ${token}` };

      const submit = await request(app)
        .post(`/api/surveys/${survey._id}/responses`)
        .set(auth)
        .send({
          subjectType: 'COUNTY',
          subjectId: county._id,
          answers: [{ questionId, value: 'Yes' }],
        });
      expect(submit.status).toBe(403);

      const list = await request(app)
        .get(`/api/surveys/${survey._id}/responses`)
        .set(auth);
      expect(list.status).toBe(200);
      expect(list.body.responses).toHaveLength(0);
    });

    it('allows admin to submit and list responses', async () => {
      const { county } = await seedCounty();
      const survey = await createSurvey(app, adminToken, 'Admin survey', {
        countyIds: [county._id],
      });
      const auth = { Authorization: `Bearer ${adminToken}` };
      const questionId = survey.questions[0].questionId;

      const submit = await request(app)
        .post(`/api/surveys/${survey._id}/responses`)
        .set(auth)
        .send({
          subjectType: 'COUNTY',
          subjectId: county._id,
          answers: [{ questionId, value: 'No' }],
        });
      expect(submit.status).toBe(201);

      const list = await request(app)
        .get(`/api/surveys/${survey._id}/responses`)
        .set(auth);
      expect(list.status).toBe(200);
      expect(list.body.responses).toHaveLength(1);
    });

    it('allows instance COUNTY:WRITE plus SURVEY:READ to fill that county only', async () => {
      const { county: countyA } = await seedCounty({ name: 'Alpha' });
      const { county: countyB } = await seedCounty({ name: 'Beta' });
      const survey = await createSurvey(app, adminToken, 'County scoped', {
        countyIds: [countyA._id, countyB._id],
      });
      const questionId = survey.questions[0].questionId;

      const limited = await Group.create({
        name: 'county-a-writers',
        members: [viewer.user._id],
      });
      await replaceGroupPermissions(limited._id, [
        {
          groupId: limited._id,
          resourceType: 'COUNTY',
          target: countyA.name,
          resourceId: countyA._id,
          permission: 'WRITE',
        },
        {
          groupId: limited._id,
          resourceType: 'COUNTY',
          target: countyA.name,
          resourceId: countyA._id,
          permission: 'READ',
        },
        {
          groupId: limited._id,
          resourceType: 'SURVEY',
          target: survey.name,
          resourceId: survey._id,
          permission: 'READ',
        },
      ]);

      const token = await login(app, 'viewer@example.com', 'Password123!');
      const auth = { Authorization: `Bearer ${token}` };

      const submitA = await request(app)
        .put(`/api/surveys/${survey._id}/subjects/COUNTY/${countyA._id}`)
        .set(auth)
        .send({ answers: [{ questionId, value: 'Yes' }] });
      expect(submitA.status).toBe(200);

      const submitB = await request(app)
        .put(`/api/surveys/${survey._id}/subjects/COUNTY/${countyB._id}`)
        .set(auth)
        .send({ answers: [{ questionId, value: 'Yes' }] });
      expect(submitB.status).toBe(403);
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
        email: 'viewer@example.com',
        password: 'Password123!',
      });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app).post('/api/auth/login').send({
        email: 'viewer@example.com',
        password: 'ViewerNewPass123!',
      });
      expect(newLogin.status).toBe(200);
    });
  });
});
