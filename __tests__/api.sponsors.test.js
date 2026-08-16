/**
 * @jest-environment node
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

const SAMPLE_SPONSOR = {
  name: 'FONPLATA',
  orgEmail: 'ops@example.org',
  origem: 'org_internacional',
  contact: 'Ops desk',
  phone: '1100000000',
  city: 'Brasília',
};

async function login(app, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

describe('Sponsors CRUD + RBAC', () => {
  let app;
  let adminToken;
  let viewerToken;
  let viewer;

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
    adminToken = await login(app, 'admin@example.com', 'AdminPassword123!');
    viewer = await seedUnprivilegedUser();
    viewerToken = await login(app, viewer.user.email, viewer.password);
  });

  it('allows admin CRUD', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const created = await request(app).post('/api/sponsors').set(auth).send(SAMPLE_SPONSOR);
    expect(created.status).toBe(201);
    expect(created.body.kind).toBe('SPONSOR');
    expect(created.body.assetType).toBe('Sponsor');
    expect(created.body.name).toBe('FONPLATA');
    expect(created.body.orgEmail).toBe('ops@example.org');

    const id = created.body._id;
    const listed = await request(app).get('/api/sponsors').set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((row) => row._id === id)).toBe(true);

    const one = await request(app).get(`/api/sponsors/${id}`).set(auth);
    expect(one.status).toBe(200);
    expect(one.body.contact).toBe('Ops desk');

    const updated = await request(app)
      .put(`/api/sponsors/${id}`)
      .set(auth)
      .send({ phone: '1199999999' });
    expect(updated.status).toBe(200);
    expect(updated.body.phone).toBe('1199999999');

    const removed = await request(app).delete(`/api/sponsors/${id}`).set(auth);
    expect(removed.status).toBe(200);
    const missing = await request(app).get(`/api/sponsors/${id}`).set(auth);
    expect(missing.status).toBe(404);
  });

  it('denies unprivileged users', async () => {
    const auth = { Authorization: `Bearer ${viewerToken}` };
    const list = await request(app).get('/api/sponsors').set(auth);
    expect(list.status).toBe(403);
    expect(list.body.code).toBe('FORBIDDEN');

    const create = await request(app).post('/api/sponsors').set(auth).send(SAMPLE_SPONSOR);
    expect(create.status).toBe(403);
  });

  it('limits instance-scoped READ to the granted sponsor', async () => {
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const a = await request(app)
      .post('/api/sponsors')
      .set(adminAuth)
      .send({ ...SAMPLE_SPONSOR, name: 'Sponsor A' });
    const b = await request(app)
      .post('/api/sponsors')
      .set(adminAuth)
      .send({ ...SAMPLE_SPONSOR, name: 'Sponsor B', orgEmail: 'b@example.org' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const group = await Group.create({
      name: 'sponsor-a-readers',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'SPONSOR',
        target: a.body.name,
        resourceId: a.body._id,
        permission: 'READ',
      },
    ]);

    const token = await login(app, viewer.user.email, viewer.password);
    const auth = { Authorization: `Bearer ${token}` };

    const list = await request(app).get('/api/sponsors').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]._id).toBe(a.body._id);

    const allowed = await request(app).get(`/api/sponsors/${a.body._id}`).set(auth);
    expect(allowed.status).toBe(200);

    const denied = await request(app).get(`/api/sponsors/${b.body._id}`).set(auth);
    expect(denied.status).toBe(403);
  });

  it('rejects invalid origem', async () => {
    const res = await request(app)
      .post('/api/sponsors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...SAMPLE_SPONSOR, origem: 'not-a-type' });
    expect(res.status).toBe(400);
  });
});
