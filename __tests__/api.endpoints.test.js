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

  describe('Objects', () => {
    it('requires auth', async () => {
      const res = await request(app).get('/api/objects');
      expect(res.status).toBe(401);
    });

    it('CRUD lifecycle works', async () => {
      const create = await request(app)
        .post('/api/objects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Billing Doc',
          description: 'Invoices',
          resourceType: 'DOCUMENT',
        });
      expect(create.status).toBe(201);
      expect(create.body.ownerId).toBe(String(userId));

      const list = await request(app)
        .get('/api/objects')
        .set('Authorization', `Bearer ${authToken}`);
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);

      const objectId = create.body._id;

      const getOne = await request(app)
        .get(`/api/objects/${objectId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(getOne.status).toBe(200);

      const update = await request(app)
        .put(`/api/objects/${objectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'Updated invoices' });
      expect(update.status).toBe(200);
      expect(update.body.description).toBe('Updated invoices');

      const remove = await request(app)
        .delete(`/api/objects/${objectId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(remove.status).toBe(200);
    });

    it('rejects create without name', async () => {
      const res = await request(app)
        .post('/api/objects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'missing name' });
      expect(res.status).toBe(400);
    });

    it('returns 501 for unimplemented object policy endpoints', async () => {
      const create = await request(app)
        .post('/api/objects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Policy Object' });
      const objectId = create.body._id;

      const members = await request(app)
        .post(`/api/objects/${objectId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetUserId: secondaryUserId });
      expect(members.status).toBe(501);

      const permissions = await request(app)
        .post(`/api/objects/${objectId}/permissions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ scopes: ['READ'], target: 'User' });
      expect(permissions.status).toBe(501);
    });
  });
});
