/**
 * @jest-environment node
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../api/models/User');
const Group = require('../api/models/Group');
const Permission = require('../api/models/Permission');
const { buildFullAdminPermissions } = require('../api/constants/rbac');
const { replaceGroupPermissions } = require('../api/services/rbacService');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
  createTestApp,
} = require('./helpers/apiTestUtils');
const {
  createMemoryEmailSender,
  setEmailSender,
  resetEmailSender,
} = require('../api/services/emailService');

describe('API endpoints', () => {
  let app;
  let authToken;
  let userId;
  let secondaryUserId;
  let mailer;

  beforeAll(async () => {
    await connectTestDatabase();
    app = createTestApp();
  }, 120000);

  afterAll(async () => {
    resetEmailSender();
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    mailer = createMemoryEmailSender();
    setEmailSender(mailer);
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

    // Grant alice full asset RBAC and admin-group membership for identity routes.
    const adminGroup = await Group.create({
      name: 'admin',
      description: 'Test full-access group',
      members: [userId],
    });
    await replaceGroupPermissions(adminGroup._id, buildFullAdminPermissions(adminGroup._id));
    await User.findByIdAndUpdate(userId, { roleId: adminGroup._id, isVerified: true });
    await User.findByIdAndUpdate(secondaryUserId, { isVerified: true });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'alice@example.com',
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

    it('sets baseline security headers', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['referrer-policy']).toBeDefined();
    });
  });

  describe('Auth', () => {
    it('POST /api/auth/register rejects missing fields', async () => {
      const res = await request(app).post('/api/auth/register').send({ username: 'x' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'Please include all fields.',
        code: 'VALIDATION',
      });
      expect(res.body.error).toBeUndefined();
    });

    it('POST /api/auth/register rejects passwords shorter than 8 characters', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'shortpwd',
        email: 'shortpwd@example.com',
        password: 'short',
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at least 8 characters/i);
    });

    it('POST /api/auth/register rejects duplicate users', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'alice',
        email: 'alice@example.com',
        password: 'Password123!',
      });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        message: 'User or Email already registered.',
        code: 'CONFLICT',
      });
    });

    it('POST /api/auth/register rejects passwords that fail shared policy', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'weakuser',
        email: 'weak@example.com',
        password: 'short',
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at least 8 characters/i);
    });

    it('POST /api/auth/login rejects invalid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'alice@example.com',
        password: 'wrong-password',
      });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        message: 'Invalid credentials.',
        code: 'INVALID_CREDENTIALS',
      });
    });

    it('POST /api/auth/login rejects unverified accounts', async () => {
      await User.findByIdAndUpdate(userId, { isVerified: false });
      const res = await request(app).post('/api/auth/login').send({
        email: 'alice@example.com',
        password: 'Password123!',
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_VERIFIED');
      expect(res.body.token).toBeUndefined();
    });

    it('GET /api/auth/verify-email verifies via emailed token and allows login', async () => {
      mailer.clear();
      const registered = await request(app).post('/api/auth/register').send({
        username: 'verifyme',
        email: 'verifyme@example.com',
        password: 'Password123!',
      });
      expect(registered.status).toBe(201);
      expect(registered.body.user.isVerified).toBe(false);

      const token = mailer.extractVerifyToken();
      expect(token).toBeTruthy();

      const deny = await request(app).post('/api/auth/login').send({
        email: 'verifyme@example.com',
        password: 'Password123!',
      });
      expect(deny.status).toBe(403);
      expect(deny.body.code).toBe('NOT_VERIFIED');

      const verified = await request(app).get(`/api/auth/verify-email/${token}`);
      expect(verified.status).toBe(200);
      expect(verified.body.user.isVerified).toBe(true);

      const login = await request(app).post('/api/auth/login').send({
        email: 'verifyme@example.com',
        password: 'Password123!',
      });
      expect(login.status).toBe(200);
      expect(login.body.token).toBeDefined();
      expect(login.body.user.lastLoginAt).toBeDefined();
    });

    it('GET /api/auth/google/status reports whether Google OAuth is configured', async () => {
      const res = await request(app).get('/api/auth/google/status');
      expect(res.status).toBe(200);
      expect(typeof res.body.enabled).toBe('boolean');
    });

    it('POST /api/auth/login authenticates with email', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'Alice@Example.com',
        password: 'Password123!',
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.expiresAt).toBeDefined();
    });

    it('POST /api/auth/login rejects username-only credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        username: 'alice',
        password: 'Password123!',
      });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        message: 'Please provide email and password.',
        code: 'VALIDATION',
      });
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
      expect(noToken.body).toEqual({
        message: 'Authentication required: no session token provided.',
        code: 'NO_TOKEN',
      });
      expect(noToken.body.error).toBeUndefined();
      expect(noToken.body.hint).toBeUndefined();
      expect(noToken.body.username).toBeUndefined();
    });

    it('lists sessions and disconnects them', async () => {
      const list = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`);
      expect(list.status).toBe(200);
      expect(list.body.scope).toBe('all');
      expect(list.body.sessions.length).toBeGreaterThanOrEqual(1);
      expect(list.body.pagination).toBeDefined();
      expect(list.body.items.length).toBe(list.body.sessions.length);

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
        email: 'alice@example.com',
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
        email: 'bob@example.com',
        password: 'Password123!',
      });
      expect(bobOld.status).toBe(401);

      const bobNew = await request(app).post('/api/auth/login').send({
        email: 'bob@example.com',
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

    it('GET /api/auth/forgot-password does not enumerate unknown emails', async () => {
      mailer.clear();
      const res = await request(app)
        .get('/api/auth/forgot-password')
        .query({ email: 'missing@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account exists/i);
      expect(mailer.messages).toHaveLength(0);
    });

    it('password reset flow succeeds with hashed token storage', async () => {
      const { hashResetToken } = require('../api/utils/passwordReset');

      mailer.clear();
      const forgot = await request(app)
        .get('/api/auth/forgot-password')
        .query({ email: 'alice@example.com' });
      expect(forgot.status).toBe(200);
      expect(forgot.body.resetToken).toBeUndefined();
      expect(forgot.body.message).toMatch(/if an account exists/i);
      expect(mailer.messages).toHaveLength(1);
      expect(mailer.last().to).toBe('alice@example.com');
      expect(mailer.last().subject).toBe('Password Reset Request');

      const resetToken = mailer.extractResetToken();
      expect(resetToken).toBeTruthy();

      const stored = await User.findOne({ email: 'alice@example.com' }).select('resetTokenHash');
      expect(stored.resetTokenHash).toBeTruthy();
      expect(stored.resetTokenHash).not.toBe(resetToken);
      expect(stored.resetTokenHash).toBe(hashResetToken(resetToken));

      const reset = await request(app)
        .post(`/api/auth/reset-password/${resetToken}`)
        .send({ newPassword: 'NewPassword123!' });
      expect(reset.status).toBe(200);

      const oldLogin = await request(app).post('/api/auth/login').send({
        email: 'alice@example.com',
        password: 'Password123!',
      });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app).post('/api/auth/login').send({
        email: 'alice@example.com',
        password: 'NewPassword123!',
      });
      expect(newLogin.status).toBe(200);
      expect(newLogin.headers['set-cookie']?.join(';') || '').toMatch(/rbac_session=/);
    });

    it('accepts httpOnly session cookie without Authorization header', async () => {
      const login = await request(app).post('/api/auth/login').send({
        email: 'alice@example.com',
        password: 'Password123!',
      });
      expect(login.status).toBe(200);
      const cookie = login.headers['set-cookie'];
      expect(cookie).toBeTruthy();
      const cookieHeader = Array.isArray(cookie) ? cookie.map((c) => c.split(';')[0]).join('; ') : cookie;

      const me = await request(app).get('/api/auth/me').set('Cookie', cookieHeader);
      expect(me.status).toBe(200);
      expect(me.body.user.username).toBe('alice');
    });

    it('POST /api/auth/reset-password/:token rejects missing password', async () => {
      const forgot = await request(app)
        .get('/api/auth/forgot-password')
        .query({ email: 'alice@example.com' });
      expect(forgot.status).toBe(200);

      const resetToken = mailer.extractResetToken();
      expect(resetToken).toBeTruthy();

      const res = await request(app)
        .post(`/api/auth/reset-password/${resetToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('POST /api/auth/reset-password/:token rejects short passwords', async () => {
      const forgot = await request(app)
        .get('/api/auth/forgot-password')
        .query({ email: 'alice@example.com' });
      expect(forgot.status).toBe(200);
      const resetToken = mailer.extractResetToken();
      expect(resetToken).toBeTruthy();

      const res = await request(app)
        .post(`/api/auth/reset-password/${resetToken}`)
        .send({ newPassword: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at least 8 characters/i);
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
      expect(list.body.items.some((group) => group.name === 'editors')).toBe(true);
      expect(list.body.pagination).toBeDefined();

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

    it('deletes related permissions and clears roleId on group delete', async () => {
      const create = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'temp-editors', description: 'Temporary group' });
      expect(create.status).toBe(201);
      const groupId = create.body._id;

      await User.findByIdAndUpdate(secondaryUserId, { roleId: groupId });

      const setPermissions = await request(app)
        .post(`/api/groups/${groupId}/permissions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          scopes: ['READ', 'WRITE'],
          resourceType: 'DOCUMENT',
          allObjects: true,
        });
      expect(setPermissions.status).toBe(200);

      const before = await Permission.countDocuments({
        $or: [{ principalType: 'GROUP', principalId: groupId }, { groupId }],
      });
      expect(before).toBeGreaterThan(0);

      const remove = await request(app)
        .delete(`/api/groups/${groupId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(remove.status).toBe(200);

      const after = await Permission.countDocuments({
        $or: [{ principalType: 'GROUP', principalId: groupId }, { groupId }],
      });
      expect(after).toBe(0);

      const secondary = await User.findById(secondaryUserId);
      expect(secondary.roleId).toBeNull();
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

      const survey = await request(app)
        .post('/api/surveys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Ops survey',
          questions: [{ prompt: 'Ok?', type: 'yes_no' }],
        });
      expect(survey.status).toBe(201);

      const updatePermissions = await request(app)
        .post(`/api/groups/${groupId}/permissions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          scopes: ['READ', 'WRITE'],
          resourceType: 'SURVEY',
          allObjects: false,
          objects: [{ id: survey.body._id, label: 'Ops survey' }],
        });
      expect(updatePermissions.status).toBe(200);
      expect(updatePermissions.headers.deprecation).toBe('true');
      expect(updatePermissions.headers.link).toMatch(/\/api\/permissions\/acl/);
      expect(updatePermissions.body.deprecated).toBe(true);
      expect(updatePermissions.body.successor).toBe('/api/permissions/acl');
      expect(updatePermissions.body.permissions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            permission: 'READ',
            target: 'Ops survey',
            resourceType: 'SURVEY',
            resourceId: expect.anything(),
          }),
          expect.objectContaining({
            permission: 'WRITE',
            target: 'Ops survey',
            resourceType: 'SURVEY',
            resourceId: expect.anything(),
          }),
        ])
      );

      const userAcl = await request(app)
        .post('/api/permissions/acl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          resourceType: 'SURVEY',
          allObjects: false,
          objects: [{ id: survey.body._id, label: 'Ops survey' }],
          entries: [
            {
              principalType: 'USER',
              principalId: secondaryUserId,
              scopes: ['READ'],
            },
          ],
        });
      expect(userAcl.status).toBe(200);
      expect(userAcl.body.acl.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            principalType: 'USER',
            principalId: String(secondaryUserId),
            scopes: expect.arrayContaining(['READ']),
          }),
        ])
      );

      const removeMember = await request(app)
        .delete(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetUserId: secondaryUserId });
      expect(removeMember.status).toBe(200);
      expect(removeMember.body.group.members.map(String)).not.toContain(String(secondaryUserId));
    });

    it('deprecated group permission write does not wipe sibling instance grants', async () => {
      const create = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'scoped-ops' });
      const groupId = create.body._id;

      const surveyA = await request(app)
        .post('/api/surveys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Survey A',
          questions: [{ prompt: 'A?', type: 'yes_no' }],
        });
      const surveyB = await request(app)
        .post('/api/surveys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Survey B',
          questions: [{ prompt: 'B?', type: 'yes_no' }],
        });
      expect(surveyA.status).toBe(201);
      expect(surveyB.status).toBe(201);

      const grantA = await request(app)
        .post(`/api/groups/${groupId}/permissions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          scopes: ['READ'],
          resourceType: 'SURVEY',
          allObjects: false,
          objects: [{ id: surveyA.body._id, label: 'Survey A' }],
        });
      expect(grantA.status).toBe(200);

      const grantB = await request(app)
        .post(`/api/groups/${groupId}/permissions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          scopes: ['WRITE'],
          resourceType: 'SURVEY',
          allObjects: false,
          objects: [{ id: surveyB.body._id, label: 'Survey B' }],
        });
      expect(grantB.status).toBe(200);
      expect(grantB.headers.deprecation).toBe('true');

      const listed = await request(app)
        .get(`/api/groups/${groupId}/permissions`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(listed.status).toBe(200);
      expect(listed.body.permissions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            permission: 'READ',
            resourceId: expect.anything(),
            target: 'Survey A',
          }),
          expect.objectContaining({
            permission: 'WRITE',
            resourceId: expect.anything(),
            target: 'Survey B',
          }),
        ])
      );
      expect(
        listed.body.permissions.filter((row) => String(row.resourceId) === String(surveyA.body._id))
      ).toHaveLength(1);
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
        .send({ scopes: [], resourceType: 'SURVEY', allObjects: true });
      expect(badPermissions.status).toBe(400);

      const identityDenied = await request(app)
        .post(`/api/groups/${groupId}/permissions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ scopes: ['READ'], resourceType: 'USER', allObjects: true });
      expect(identityDenied.status).toBe(400);
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
      expect(list.body.items.length).toBeGreaterThanOrEqual(2);
      expect(list.body.pagination.total).toBeGreaterThanOrEqual(2);

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
      expect(create.body.isVerified).toBe(true);
    });

    it('allows admin to toggle isVerified and rejects roleId mass assignment', async () => {
      const registered = await request(app).post('/api/auth/register').send({
        username: 'dave',
        email: 'dave@example.com',
        password: 'Password123!',
      });
      expect(registered.status).toBe(201);
      expect(registered.body.user.isVerified).toBe(false);
      const daveId = registered.body.user.id;

      const denyLogin = await request(app).post('/api/auth/login').send({
        email: 'dave@example.com',
        password: 'Password123!',
      });
      expect(denyLogin.status).toBe(403);
      expect(denyLogin.body.code).toBe('NOT_VERIFIED');

      const verify = await request(app)
        .put(`/api/users/${daveId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ isVerified: true, roleId: userId, password: 'Hacked123!' });
      expect(verify.status).toBe(200);
      expect(verify.body.isVerified).toBe(true);
      expect(String(verify.body.roleId || '')).not.toBe(String(userId));

      const allowLogin = await request(app).post('/api/auth/login').send({
        email: 'dave@example.com',
        password: 'Password123!',
      });
      expect(allowLogin.status).toBe(200);
      expect(allowLogin.body.token).toBeDefined();
    });

    it('rejects create user with short password', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          username: 'dave',
          email: 'dave@example.com',
          password: 'short',
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at least 8 characters/i);
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

    it('rejects SURVEY kind on asset create without falling through', async () => {
      const res = await request(app)
        .post('/api/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'via-assets-SURVEY', kind: 'SURVEY' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/surveys API/i);

      const invalid = await request(app)
        .post('/api/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'via-assets-SURVEY_RESPONSE', kind: 'SURVEY_RESPONSE' });
      expect(invalid.status).toBe(400);
      expect(invalid.body.message).toMatch(/Invalid asset kind/i);
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

    it('lists surveys with pagination, search, filter, and sort', async () => {
      const created = [];
      for (const name of ['Alpha searchmark', 'Beta other', 'Gamma searchmark']) {
        const res = await request(app)
          .post('/api/surveys')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name,
            description: `${name} description`,
            questions: [{ prompt: 'Q?', type: 'text' }],
          });
        expect(res.status).toBe(201);
        created.push(res.body);
      }

      const listed = await request(app)
        .get('/api/surveys')
        .query({ search: 'searchmark', sort: 'name', order: 'asc', page: 1, limit: 10 })
        .set('Authorization', `Bearer ${authToken}`);

      expect(listed.status).toBe(200);
      expect(listed.body).toMatchObject({
        page: 1,
        limit: 10,
        sort: 'name',
        order: 'asc',
        search: 'searchmark',
      });
      expect(listed.body.total).toBeGreaterThanOrEqual(2);
      expect(listed.body.items.every((s) => /searchmark/i.test(s.name))).toBe(true);
      expect(listed.body.items.map((s) => s.name)).toEqual(
        [...listed.body.items.map((s) => s.name)].sort((a, b) => a.localeCompare(b))
      );

      const pageOne = await request(app)
        .get('/api/surveys')
        .query({ search: 'searchmark', sort: 'name', order: 'asc', page: 1, limit: 1 })
        .set('Authorization', `Bearer ${authToken}`);
      expect(pageOne.status).toBe(200);
      expect(pageOne.body.items).toHaveLength(1);
      expect(pageOne.body.totalPages).toBeGreaterThanOrEqual(2);

      const filtered = await request(app)
        .get('/api/surveys')
        .query({ createdBy: String(userId), limit: 50 })
        .set('Authorization', `Bearer ${authToken}`);
      expect(filtered.status).toBe(200);
      expect(filtered.body.filters.createdBy).toBe(String(userId));
      expect(filtered.body.items.length).toBeGreaterThanOrEqual(3);
      expect(
        filtered.body.items.every((s) => String(s.createdBy?._id || s.createdBy) === String(userId))
      ).toBe(true);

      created.forEach((survey) => {
        expect(survey._id).toBeTruthy();
      });
    });
  });
});
