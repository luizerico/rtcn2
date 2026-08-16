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

async function login(app, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function createSponsor(app, token) {
  const res = await request(app)
    .post('/api/sponsors')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Nestlé',
      orgEmail: 'falecom@example.com',
      origem: 'emp_com_fins_lucrativos',
      contact: 'Challenge desk',
      phone: '1155084400',
    });
  expect(res.status).toBe(201);
  return res.body;
}

function sampleOpportunity(sponsorId) {
  return {
    name: 'Climate call',
    description: 'Municipal climate finance window',
    sponsor: sponsorId,
    type: 'financial',
    category: 'call',
    eligibility: 'municipal_public_administration',
    website: 'https://example.org/call',
    submissionMethod: 'Online form',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    continuous: false,
    budget: 100000,
    totalBudget: 500000,
    currency: 'R$ BRL',
  };
}

describe('Opportunities CRUD + RBAC', () => {
  let app;
  let adminToken;
  let viewerToken;
  let viewer;
  let sponsor;

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
    sponsor = await createSponsor(app, adminToken);
  });

  it('allows admin CRUD', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const created = await request(app)
      .post('/api/opportunities')
      .set(auth)
      .send(sampleOpportunity(sponsor._id));
    expect(created.status).toBe(201);
    expect(created.body.kind).toBe('OPPORTUNITY');
    expect(created.body.sponsor._id || created.body.sponsor).toBeDefined();

    const id = created.body._id;
    const listed = await request(app).get('/api/opportunities').set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((row) => row._id === id)).toBe(true);

    const updated = await request(app)
      .put(`/api/opportunities/${id}`)
      .set(auth)
      .send({ budget: 150000 });
    expect(updated.status).toBe(200);
    expect(updated.body.budget).toBe(150000);

    const removed = await request(app).delete(`/api/opportunities/${id}`).set(auth);
    expect(removed.status).toBe(200);
  });

  it('denies unprivileged users', async () => {
    const auth = { Authorization: `Bearer ${viewerToken}` };
    const list = await request(app).get('/api/opportunities').set(auth);
    expect(list.status).toBe(403);

    const create = await request(app)
      .post('/api/opportunities')
      .set(auth)
      .send(sampleOpportunity(sponsor._id));
    expect(create.status).toBe(403);
  });

  it('limits instance-scoped READ to the granted opportunity', async () => {
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const a = await request(app)
      .post('/api/opportunities')
      .set(adminAuth)
      .send({ ...sampleOpportunity(sponsor._id), name: 'Opp A' });
    const b = await request(app)
      .post('/api/opportunities')
      .set(adminAuth)
      .send({ ...sampleOpportunity(sponsor._id), name: 'Opp B' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const group = await Group.create({
      name: 'opp-a-readers',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'OPPORTUNITY',
        target: a.body.name,
        resourceId: a.body._id,
        permission: 'READ',
      },
    ]);

    const token = await login(app, viewer.user.email, viewer.password);
    const auth = { Authorization: `Bearer ${token}` };
    const list = await request(app).get('/api/opportunities').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]._id).toBe(a.body._id);

    const denied = await request(app).get(`/api/opportunities/${b.body._id}`).set(auth);
    expect(denied.status).toBe(403);
  });

  it('rejects unknown sponsor and inverted dates', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const missingSponsor = await request(app)
      .post('/api/opportunities')
      .set(auth)
      .send(sampleOpportunity('507f1f77bcf86cd799439011'));
    expect(missingSponsor.status).toBe(400);

    const dates = await request(app)
      .post('/api/opportunities')
      .set(auth)
      .send({
        ...sampleOpportunity(sponsor._id),
        startDate: '2026-12-31',
        endDate: '2026-01-01',
      });
    expect(dates.status).toBe(400);
  });
});
