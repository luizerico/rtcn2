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

async function seedOpportunity(app, token) {
  const sponsor = await request(app)
    .post('/api/sponsors')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'FONPLATA',
      orgEmail: 'ops@example.org',
      origem: 'org_internacional',
      contact: 'Ops',
      phone: '1100000000',
    });
  expect(sponsor.status).toBe(201);

  const opportunity = await request(app)
    .post('/api/opportunities')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Climate call',
      description: 'Window',
      sponsor: sponsor.body._id,
      type: 'financial',
      category: 'financing',
      eligibility: 'state_public_administration',
      website: 'https://example.org',
      submissionMethod: 'Email',
      startDate: '2026-02-01',
      budget: 20000,
    });
  expect(opportunity.status).toBe(201);
  return opportunity.body;
}

function sampleProject(opportunityId) {
  return {
    name: 'River basin plan',
    description: 'Implementation phase',
    opportunity: opportunityId,
    projWebsite: 'https://example.org/project',
    projStartDate: '2026-03-01',
    projEndDate: '2026-11-01',
    projBudget: 25000,
    currency: 'R$ BRL',
    projStatus: 'in-progress',
  };
}

describe('Projects CRUD + RBAC', () => {
  let app;
  let adminToken;
  let viewerToken;
  let viewer;
  let opportunity;

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
    opportunity = await seedOpportunity(app, adminToken);
  });

  it('allows admin CRUD', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const created = await request(app)
      .post('/api/projects')
      .set(auth)
      .send(sampleProject(opportunity._id));
    expect(created.status).toBe(201);
    expect(created.body.kind).toBe('PROJECT');
    expect(created.body.projStatus).toBe('in-progress');

    const id = created.body._id;
    const listed = await request(app).get('/api/projects').set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((row) => row._id === id)).toBe(true);

    const updated = await request(app)
      .put(`/api/projects/${id}`)
      .set(auth)
      .send({ projStatus: 'completed' });
    expect(updated.status).toBe(200);
    expect(updated.body.projStatus).toBe('completed');

    const removed = await request(app).delete(`/api/projects/${id}`).set(auth);
    expect(removed.status).toBe(200);
  });

  it('denies unprivileged users', async () => {
    const auth = { Authorization: `Bearer ${viewerToken}` };
    const list = await request(app).get('/api/projects').set(auth);
    expect(list.status).toBe(403);

    const create = await request(app)
      .post('/api/projects')
      .set(auth)
      .send(sampleProject(opportunity._id));
    expect(create.status).toBe(403);
  });

  it('limits instance-scoped READ to the granted project', async () => {
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const a = await request(app)
      .post('/api/projects')
      .set(adminAuth)
      .send({ ...sampleProject(opportunity._id), name: 'Project A' });
    const b = await request(app)
      .post('/api/projects')
      .set(adminAuth)
      .send({ ...sampleProject(opportunity._id), name: 'Project B' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const group = await Group.create({
      name: 'project-a-readers',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'PROJECT',
        target: a.body.name,
        resourceId: a.body._id,
        permission: 'READ',
      },
    ]);

    const token = await login(app, viewer.user.email, viewer.password);
    const auth = { Authorization: `Bearer ${token}` };
    const list = await request(app).get('/api/projects').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]._id).toBe(a.body._id);

    const denied = await request(app).get(`/api/projects/${b.body._id}`).set(auth);
    expect(denied.status).toBe(403);
  });

  it('rejects unknown opportunity and inverted dates', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const missing = await request(app)
      .post('/api/projects')
      .set(auth)
      .send(sampleProject('507f1f77bcf86cd799439011'));
    expect(missing.status).toBe(400);

    const dates = await request(app)
      .post('/api/projects')
      .set(auth)
      .send({
        ...sampleProject(opportunity._id),
        projStartDate: '2026-12-01',
        projEndDate: '2026-01-01',
      });
    expect(dates.status).toBe(400);
  });
});
