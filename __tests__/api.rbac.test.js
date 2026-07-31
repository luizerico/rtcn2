/**
 * @jest-environment node
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
const { ACTIONS, RESOURCE_TYPES } = require('../api/constants/rbac');

describe('RBAC admin full access', () => {
  let app;
  let adminToken;
  let adminUser;
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

    const adminLogin = await request(app).post('/api/auth/login').send({
      username: 'admin',
      password: 'AdminPassword123!',
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;

    const viewer = await seedUnprivilegedUser();
    const viewerLogin = await request(app).post('/api/auth/login').send({
      username: viewer.user.username,
      password: viewer.password,
    });
    expect(viewerLogin.status).toBe(200);
    viewerToken = viewerLogin.body.token;
  });

  it('seeds full admin permissions for USER, GROUP, and OBJECT', async () => {
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('admin');
    expect(me.body.permissions.length).toBe(RESOURCE_TYPES.length * ACTIONS.length);

    for (const resourceType of RESOURCE_TYPES) {
      for (const permission of ACTIONS) {
        expect(me.body.permissions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              resourceType,
              permission,
              target: '*',
            }),
          ])
        );
      }
    }
  });

  it('allows admin full access across users, groups, and objects', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };

    const createUser = await request(app)
      .post('/api/users')
      .set(auth)
      .send({
        username: 'managed-user',
        email: 'managed@example.com',
        password: 'Password123!',
      });
    expect(createUser.status).toBe(201);

    const listUsers = await request(app).get('/api/users').set(auth);
    expect(listUsers.status).toBe(200);
    expect(listUsers.body.some((user) => user.username === 'managed-user')).toBe(true);

    const createGroup = await request(app)
      .post('/api/groups')
      .set(auth)
      .send({ name: 'ops', description: 'Operations' });
    expect(createGroup.status).toBe(201);
    const groupId = createGroup.body._id;

    const addMember = await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set(auth)
      .send({ targetUserId: createUser.body._id });
    expect(addMember.status).toBe(200);

    const setPermissions = await request(app)
      .post(`/api/groups/${groupId}/permissions`)
      .set(auth)
      .send({
        scopes: ['READ', 'WRITE', 'CREATE', 'DELETE'],
        target: '*',
        resourceType: 'OBJECT',
      });
    expect(setPermissions.status).toBe(200);

    const createObject = await request(app)
      .post('/api/objects')
      .set(auth)
      .send({
        name: 'Policy Document',
        description: 'Admin-managed object',
        resourceType: 'DOCUMENT',
      });
    expect(createObject.status).toBe(201);
    expect(String(createObject.body.ownerId)).toBe(String(adminUser._id));

    const listObjects = await request(app).get('/api/objects').set(auth);
    expect(listObjects.status).toBe(200);
    expect(listObjects.body).toHaveLength(1);

    const updateObject = await request(app)
      .put(`/api/objects/${createObject.body._id}`)
      .set(auth)
      .send({ description: 'Updated by admin' });
    expect(updateObject.status).toBe(200);

    const deleteObject = await request(app)
      .delete(`/api/objects/${createObject.body._id}`)
      .set(auth);
    expect(deleteObject.status).toBe(200);

    const deleteGroup = await request(app).delete(`/api/groups/${groupId}`).set(auth);
    expect(deleteGroup.status).toBe(200);

    const deleteUser = await request(app)
      .delete(`/api/users/${createUser.body._id}`)
      .set(auth);
    expect(deleteUser.status).toBe(200);
  });

  it('denies unprivileged users access to protected admin resources', async () => {
    const auth = { Authorization: `Bearer ${viewerToken}` };

    const users = await request(app).get('/api/users').set(auth);
    expect(users.status).toBe(403);

    const groups = await request(app).get('/api/groups').set(auth);
    expect(groups.status).toBe(403);

    const objects = await request(app).get('/api/objects').set(auth);
    expect(objects.status).toBe(403);

    const createObject = await request(app)
      .post('/api/objects')
      .set(auth)
      .send({ name: 'Blocked' });
    expect(createObject.status).toBe(403);
  });

  it('keeps full permissions after re-running admin bootstrap', async () => {
    await seedAdminUser({
      username: 'admin',
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(me.status).toBe(200);
    expect(me.body.permissions.length).toBe(RESOURCE_TYPES.length * ACTIONS.length);

    const listUsers = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listUsers.status).toBe(200);
  });
});
