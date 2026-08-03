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
const Permission = require('../api/models/Permission');
const Group = require('../api/models/Group');
const {
  principalQueryForUser,
  migratePermissionPrincipals,
  userHasPermission,
} = require('../api/services/rbacService');

describe('RBAC admin full access', () => {
  let app;
  let adminToken;
  let adminUser;
  let viewerToken;
  let viewerUser;

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
    viewerUser = viewer.user;
    const viewerLogin = await request(app).post('/api/auth/login').send({
      username: viewer.user.username,
      password: viewer.password,
    });
    expect(viewerLogin.status).toBe(200);
    viewerToken = viewerLogin.body.token;
  });

  it('seeds full admin permissions for asset subclasses only', async () => {
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

  it('lists all permissions for management views', async () => {
      const res = await request(app)
        .get('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toEqual(
        expect.objectContaining({
          groupName: expect.any(String),
          resourceType: expect.any(String),
          target: expect.any(String),
          permission: expect.any(String),
        })
      );
    });

    it('allows admin full access across users, groups, and assets', async () => {
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
        resourceType: 'DOCUMENT',
        allObjects: true,
      });
    expect(setPermissions.status).toBe(200);

    const createAsset = await request(app)
      .post('/api/assets')
      .set(auth)
      .send({
        name: 'Policy Document',
        description: 'Admin-managed asset',
        kind: 'DOCUMENT',
      });
    expect(createAsset.status).toBe(201);
    expect(String(createAsset.body.ownerId)).toBe(String(adminUser._id));
    expect(String(createAsset.body.createdBy)).toBe(String(adminUser._id));

    const listAssets = await request(app).get('/api/assets').set(auth);
    expect(listAssets.status).toBe(200);
    expect(listAssets.body).toHaveLength(1);

    const updateAsset = await request(app)
      .put(`/api/assets/${createAsset.body._id}`)
      .set(auth)
      .send({ description: 'Updated by admin' });
    expect(updateAsset.status).toBe(200);

    const deleteAsset = await request(app)
      .delete(`/api/assets/${createAsset.body._id}`)
      .set(auth);
    expect(deleteAsset.status).toBe(200);

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

    const logs = await request(app).get('/api/logs').set(auth);
    expect(logs.status).toBe(403);

    const assets = await request(app).get('/api/assets').set(auth);
    expect(assets.status).toBe(403);

    const createAsset = await request(app)
      .post('/api/assets')
      .set(auth)
      .send({ name: 'Blocked' });
    expect(createAsset.status).toBe(403);
  });

  it('limits a group to SURVEY objects without DOCUMENT access', async () => {
    const Group = require('../api/models/Group');
    const { replaceGroupPermissions } = require('../api/services/rbacService');

    const surveyGroup = await Group.create({
      name: 'survey-only',
      description: 'Can manage surveys only',
      members: [viewerUser._id],
    });

    await replaceGroupPermissions(surveyGroup._id, [
      {
        groupId: surveyGroup._id,
        resourceType: 'SURVEY',
        target: '*',
        resourceId: null,
        permission: 'READ',
      },
      {
        groupId: surveyGroup._id,
        resourceType: 'SURVEY',
        target: '*',
        resourceId: null,
        permission: 'CREATE',
      },
      {
        groupId: surveyGroup._id,
        resourceType: 'SURVEY_RESPONSE',
        target: '*',
        resourceId: null,
        permission: 'CREATE',
      },
      {
        groupId: surveyGroup._id,
        resourceType: 'SURVEY_RESPONSE',
        target: '*',
        resourceId: null,
        permission: 'READ',
      },
    ]);

    const login = await request(app).post('/api/auth/login').send({
      username: 'viewer',
      password: 'Password123!',
    });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const assets = await request(app).get('/api/assets').set(auth);
    expect(assets.status).toBe(200);
    // May see surveys they can access, but not other asset kinds they were never granted.
    expect(assets.body.every((row) => row.kind === 'SURVEY')).toBe(true);

    const createDoc = await request(app)
      .post('/api/assets')
      .set(auth)
      .send({ name: 'Secret doc', kind: 'DOCUMENT' });
    expect(createDoc.status).toBe(403);

    const createSurvey = await request(app)
      .post('/api/surveys')
      .set(auth)
      .send({
        name: 'Scoped survey',
        questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      });
    expect(createSurvey.status).toBe(201);
    expect(createSurvey.body.questions).toHaveLength(1);
    expect(createSurvey.body.assetType).toBe('Survey');

    const listSurveys = await request(app).get('/api/surveys').set(auth);
    expect(listSurveys.status).toBe(200);
    expect(listSurveys.body.items.some((s) => s.name === 'Scoped survey')).toBe(true);
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
  it('builds hot-path queries without legacy groupId $or clauses', () => {
    const userOnly = principalQueryForUser('user-1', []);
    expect(userOnly).toEqual({ principalType: 'USER', principalId: 'user-1' });
    expect(JSON.stringify(userOnly)).not.toMatch(/"groupId"/);

    const withGroups = principalQueryForUser('user-1', ['g1', 'g2']);
    expect(withGroups).toEqual({
      $or: [
        { principalType: 'USER', principalId: 'user-1' },
        { principalType: 'GROUP', principalId: { $in: ['g1', 'g2'] } },
      ],
    });
    expect(JSON.stringify(withGroups)).not.toMatch(/"groupId"/);
  });

  it('backfills legacy groupId-only rows so authz works without legacy filters', async () => {
    const group = await Group.create({ name: 'legacy-survey-readers', description: 'legacy' });
    await Group.updateOne({ _id: group._id }, { $addToSet: { members: viewerUser._id } });

    await Permission.collection.insertOne({
      groupId: group._id,
      resourceType: 'SURVEY',
      target: '*',
      resourceId: null,
      permission: 'READ',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const before = await userHasPermission(viewerUser, 'SURVEY:READ');
    expect(before).toBe(false);

    const result = await migratePermissionPrincipals();
    expect(result.updated).toBeGreaterThanOrEqual(1);

    const normalized = await Permission.findOne({
      principalType: 'GROUP',
      principalId: group._id,
      resourceType: 'SURVEY',
      permission: 'READ',
    });
    expect(normalized).toBeTruthy();

    const after = await userHasPermission(viewerUser, 'SURVEY:READ');
    expect(after).toBe(true);
  });

  it('deletes irreparable legacy rows with no groupId to promote', async () => {
    const insert = await Permission.collection.insertOne({
      resourceType: 'DOCUMENT',
      target: '*',
      resourceId: null,
      permission: 'READ',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await migratePermissionPrincipals();
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    const gone = await Permission.collection.findOne({ _id: insert.insertedId });
    expect(gone).toBeNull();
  });

});
