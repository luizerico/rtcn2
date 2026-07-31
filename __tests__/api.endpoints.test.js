/**
 * @jest-environment node
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../api/models/User');
const Group = require('../api/models/Group');
const { buildFullAdminPermissions } = require('../api/constants/rbac');
const { replaceGroupPermissions } = require('../api/services/rbacService');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
  createTestApp,
} = require('./helpers/apiTestUtils');

describe('API endpoints', () => {
  let app;
  let authToken;
  let userId;
  let secondaryUserId;

  beforeAll(async () => {
    await connectTestDatabase();
    app = createTestApp();
  }, 120000);

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();

    const registerRes = await request(app).post('/api/auth/register').send({
      username: 'alice',
      email: 'alice@example.com',
      password: 'Password123!',
    });
    userId = registerRes.body.user.id;

    const secondary = await request(app).post('/api/auth/register').send({
      username: 'bob',
      email: 'bob@example.com',
      password: 'Password123!',
    });
    secondaryUserId = secondary.body.user.id;

    // Grant alice full RBAC so endpoint CRUD suites exercise authorized paths.
    const adminGroup = await Group.create({
      name: 'alice-admin',
      description: 'Test full-access group',
      members: [userId],
    });
    await replaceGroupPermissions(adminGroup._id, buildFullAdminPermissions(adminGroup._id));
    await User.findByIdAndUpdate(userId, { roleId: adminGroup._id });

    const loginRes = await request(app).post('/api/auth/login').send({
      username: 'alice',
      password: 'Password123!',
    });
    authToken = loginRes.body.token;
  });

  describe('GET /api/health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('Auth', () => {
    it('POST /api/auth/register rejects missing fields', async () => {
      const res = await request(app).post('/api/auth/register').send({ username: 'x' });
      expect(res.status).toBe(400);
    });

    it('POST /api/auth/register rejects duplicate users', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'alice',
        email: 'alice@example.com',
        password: 'Password123!',
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/auth/login rejects invalid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        username: 'alice',
        password: 'wrong-password',
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/auth/login accepts email as login id', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'alice@example.com',
        password: 'Password123!',
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.expiresAt).toBeDefined();
    });

    it('GET /api/auth/me and validate require an active DB session', async () => {
      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);
      expect(me.status).toBe(200);
      expect(me.body.user.username).toBe('alice');
      expect(me.body.session.sessionId).toBeDefined();

      const validate = await request(app)
        .get('/api/auth/validate')
        .set('Authorization', `Bearer ${authToken}`);
      expect(validate.status).toBe(200);
      expect(validate.body.valid).toBe(true);

      const noToken = await request(app).get('/api/auth/me');
      expect(noToken.status).toBe(401);
      expect(noToken.body.code).toBe('NO_TOKEN');
    });

    it('lists sessions and disconnects them', async () => {
      const list = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`);
      expect(list.status).toBe(200);
      expect(list.body.scope).toBe('all');
      expect(list.body.sessions.length).toBeGreaterThanOrEqual(1);

      const sessionId = list.body.sessions[0].sessionId;
      const disconnect = await request(app)
        .delete(`/api/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(disconnect.status).toBe(200);

      const after = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);
      expect(after.status).toBe(401);
      expect(after.body.code).toBe('REVOKED');
    });

    it('change-password revokes sessions and admin can reset another user', async () => {
      const change = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'ChangedPass123!',
        });
      expect(change.status).toBe(200);

      const revokedMe = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);
      expect(revokedMe.status).toBe(401);
      expect(revokedMe.body.code).toBe('REVOKED');

      const relogin = await request(app).post('/api/auth/login').send({
        username: 'alice',
        password: 'ChangedPass123!',
      });
      expect(relogin.status).toBe(200);
      authToken = relogin.body.token;

      const adminReset = await request(app)
        .post(`/api/users/${secondaryUserId}/password`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ newPassword: 'BobNewPass123!' });
      expect(adminReset.status).toBe(200);

      const bobOld = await request(app).post('/api/auth/login').send({
        username: 'bob',
        password: 'Password123!',
      });
      expect(bobOld.status).toBe(401);

      const bobNew = await request(app).post('/api/auth/login').send({
        username: 'bob',
        password: 'BobNewPass123!',
      });
      expect(bobNew.status).toBe(200);
    });

    it('POST /api/auth/logout revokes the current session', async () => {
      const logout = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);
      expect(logout.status).toBe(200);

      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);
      expect(me.status).toBe(401);
      expect(me.body.code).toBe('REVOKED');
    });

    it('GET /api/auth/forgot-password requires email', async () => {
      const res = await request(app).get('/api/auth/forgot-password');
      expect(res.status).toBe(400);
    });

    it('GET /api/auth/forgot-password returns 404 for unknown email', async () => {
      const res = await request(app)
        .get('/api/auth/forgot-password')
        .query({ email: 'missing@example.com' });
      expect(res.status).toBe(404);
    });

    it('password reset flow succeeds', async () => {
      const forgot = await request(app)
        .get('/api/auth/forgot-password')
        .query({ email: 'alice@example.com' });
      expect(forgot.status).toBe(200);
      expect(forgot.body.resetToken).toBeDefined();

      const reset = await request(app)
        .post(`/api/auth/reset-password/${forgot.body.resetToken}`)
        .send({ newPassword: 'NewPassword123!' });
      expect(reset.status).toBe(200);

      const oldLogin = await request(app).post('/api/auth/login').send({
        username: 'alice',
        password: 'Password123!',
      });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app).post('/api/auth/login').send({
        username: 'alice',
        password: 'NewPassword123!',
      });
      expect(newLogin.status).toBe(200);
    });

    it('POST /api/auth/reset-password/:token rejects missing password', async () => {
      const forgot = await request(app)
        .get('/api/auth/forgot-password')
        .query({ email: 'alice@example.com' });

      const res = await request(app)
        .post(`/api/auth/reset-password/${forgot.body.resetToken}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('Groups', () => {
    it('requires auth', async () => {
      const res = await request(app).get('/api/groups');
      expect(res.status).toBe(401);
    });

    it('CRUD lifecycle works', async () => {
      const create = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'editors', description: 'Can edit content' });
      expect(create.status).toBe(201);
      expect(create.body.name).toBe('editors');

      const list = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${authToken}`);
      expect(list.status).toBe(200);
      expect(list.body.some((group) => group.name === 'editors')).toBe(true);

      const groupId = create.body._id;

      const getOne = await request(app)
        .get(`/api/groups/${groupId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(getOne.status).toBe(200);
      expect(getOne.body._id).toBe(groupId);

      const update = await request(app)
        .put(`/api/groups/${groupId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'Updated description' });
      expect(update.status).toBe(200);
      expect(update.body.description).toBe('Updated description');

      const remove = await request(app)
        .delete(`/api/groups/${groupId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(remove.status).toBe(200);

      const missing = await request(app)
        .get(`/api/groups/${groupId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(missing.status).toBe(404);
    });

    it('rejects create without name', async () => {
      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'no name' });
      expect(res.status).toBe(400);
    });

    it('membership and permissions endpoints work', async () => {
      const create = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'ops' });
      const groupId = create.body._id;

      const addMember = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetUserId: secondaryUserId });
      expect(addMember.status).toBe(200);
      expect(addMember.body.group.members.map(String)).toContain(String(secondaryUserId));

      const updatePermissions = await request(app)
        .post(`/api/groups/${groupId}/permissions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          scopes: ['READ', 'WRITE'],
          target: 'User',
          resourceType: 'USER',
        });
      expect(updatePermissions.status).toBe(200);
      expect(updatePermissions.body.permissions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ permission: 'READ', target: 'User', resourceType: 'USER' }),
          expect.objectContaining({ permission: 'WRITE', target: 'User', resourceType: 'USER' }),
        ])
      );

      const removeMember = await request(app)
        .delete(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetUserId: secondaryUserId });
      expect(removeMember.status).toBe(200);
      expect(removeMember.body.group.members.map(String)).not.toContain(String(secondaryUserId));
    });

    it('validates membership and permission payloads', async () => {
      const create = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'qa' });
      const groupId = create.body._id;

      const missingMember = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      expect(missingMember.status).toBe(400);

      const unknownMember = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetUserId: new mongoose.Types.ObjectId().toString() });
      expect(unknownMember.status).toBe(404);

      const badPermissions = await request(app)
        .post(`/api/groups/${groupId}/permissions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ scopes: [], target: 'User' });
      expect(badPermissions.status).toBe(400);
    });
  });

  describe('Users', () => {
    it('requires auth', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
    });

    it('lists and creates users', async () => {
      const list = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`);
      expect(list.status).toBe(200);
      expect(list.body.length).toBeGreaterThanOrEqual(2);

      const create = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          username: 'carol',
          email: 'carol@example.com',
          password: 'Password123!',
        });
      expect(create.status).toBe(201);
      expect(create.body.username).toBe('carol');
    });
  });

  describe('Assets', () => {
    it('requires auth', async () => {
      const res = await request(app).get('/api/assets');
      expect(res.status).toBe(401);
    });

    it('CRUD lifecycle works', async () => {
      const create = await request(app)
        .post('/api/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Billing Doc',
          description: 'Invoices',
          kind: 'DOCUMENT',
        });
      expect(create.status).toBe(201);
      expect(create.body.ownerId).toBe(String(userId));
      expect(create.body.createdBy).toBe(String(userId));
      expect(create.body.updatedBy).toBe(String(userId));
      expect(create.body.createdAt).toBeDefined();
      expect(create.body.updatedAt).toBeDefined();

      const list = await request(app)
        .get('/api/assets')
        .set('Authorization', `Bearer ${authToken}`);
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);

      const assetId = create.body._id;

      const getOne = await request(app)
        .get(`/api/assets/${assetId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(getOne.status).toBe(200);

      const update = await request(app)
        .put(`/api/assets/${assetId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'Updated invoices' });
      expect(update.status).toBe(200);
      expect(update.body.description).toBe('Updated invoices');
      expect(update.body.updatedBy).toBe(String(userId));

      const remove = await request(app)
        .delete(`/api/assets/${assetId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(remove.status).toBe(200);
    });

    it('rejects create without name', async () => {
      const res = await request(app)
        .post('/api/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'missing name' });
      expect(res.status).toBe(400);
    });

    it('returns 501 for unimplemented asset policy endpoints', async () => {
      const create = await request(app)
        .post('/api/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Policy Asset' });
      const assetId = create.body._id;

      const members = await request(app)
        .post(`/api/assets/${assetId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetUserId: secondaryUserId });
      expect(members.status).toBe(501);

      const permissions = await request(app)
        .post(`/api/assets/${assetId}/permissions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ scopes: ['READ'], target: 'User' });
      expect(permissions.status).toBe(501);
    });
  });

  describe('Surveys', () => {
    it('creates a survey, accepts answers, and visualizes response summary', async () => {
      const create = await request(app)
        .post('/api/surveys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Customer pulse',
          description: 'Quick feedback',
          questions: [
            { prompt: 'How was the service?', type: 'text' },
            { prompt: 'Would you recommend us?', type: 'yes_no' },
            {
              prompt: 'Favorite channel?',
              type: 'multiple_choice',
              options: ['Email', 'Chat', 'Phone'],
            },
          ],
        });
      expect(create.status).toBe(201);
      expect(create.body.assetType).toBe('Survey');
      expect(create.body.kind).toBe('SURVEY');
      expect(create.body.questions).toHaveLength(3);
      expect(create.body.createdBy).toBe(String(userId));

      const surveyId = create.body._id;
      const [textQ, yesNoQ, choiceQ] = create.body.questions;

      const submit = await request(app)
        .post(`/api/surveys/${surveyId}/responses`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          answers: [
            { questionId: textQ.questionId, value: 'Great support' },
            { questionId: yesNoQ.questionId, value: 'Yes' },
            { questionId: choiceQ.questionId, value: 'Chat' },
          ],
        });
      expect(submit.status).toBe(201);
      expect(submit.body.assetType).toBe('SurveyResponse');
      expect(submit.body.kind).toBe('SURVEY_RESPONSE');
      expect(submit.body.surveyId).toBe(surveyId);

      const results = await request(app)
        .get(`/api/surveys/${surveyId}/responses`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(results.status).toBe(200);
      expect(results.body.responses).toHaveLength(1);
      expect(results.body.summary.responseCount).toBe(1);
      expect(results.body.summary.questions[1].counts.Yes).toBe(1);
      expect(results.body.summary.questions[2].counts.Chat).toBe(1);
    });

    it('rejects surveys without questions', async () => {
      const res = await request(app)
        .post('/api/surveys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Empty', questions: [] });
      expect(res.status).toBe(400);
    });
  });
});
