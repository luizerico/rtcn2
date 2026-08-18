/**
 * @jest-environment node
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.FILE_STORAGE_DRIVER = 'tmp';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const User = require('../api/models/User');
const Group = require('../api/models/Group');
const Permission = require('../api/models/Permission');
const InstrumentResponse = require('../api/models/survey/InstrumentResponse');
const StoredFile = require('../api/models/StoredFile');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
  createTestApp,
  seedAdminUser,
  seedUnprivilegedUser,
  seedCounty,
} = require('./helpers/apiTestUtils');
const { resetStorageDriverForTests } = require('../api/services/storage');
const { pdfBuffer } = require('./helpers/fileFixtures');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtcn-bin-'));
process.env.FILE_STORAGE_TMP_DIR = tmpDir;

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
      name: 'FONPLATA',
      orgEmail: 'ops@example.org',
      origem: 'org_internacional',
      contact: 'Ops desk',
      phone: '1100000000',
      city: 'Brasília',
    });
  expect(res.status).toBe(201);
  return res.body;
}

describe('Unified recycle bin', () => {
  let app;
  let admin;
  let adminToken;
  let viewer;
  let viewerToken;

  beforeAll(async () => {
    resetStorageDriverForTests();
    await connectTestDatabase();
    app = createTestApp();
  }, 120000);

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    admin = await seedAdminUser({
      username: 'admin',
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });
    adminToken = await login(app, 'admin@example.com', 'AdminPassword123!');
    viewer = await seedUnprivilegedUser();
    viewerToken = await login(app, viewer.user.email, viewer.password);
  });

  it('denies unprivileged users from listing, restoring, purging, and emptying', async () => {
    const auth = { Authorization: `Bearer ${viewerToken}` };
    const list = await request(app).get('/api/bin').set(auth);
    expect(list.status).toBe(403);

    const restore = await request(app)
      .post(`/api/bin/USER/${viewer.user._id}/restore`)
      .set(auth);
    expect(restore.status).toBe(403);

    const purge = await request(app).delete(`/api/bin/USER/${viewer.user._id}`).set(auth);
    expect(purge.status).toBe(403);

    const empty = await request(app).delete('/api/bin').set(auth);
    expect(empty.status).toBe(403);
  });

  it('soft-deletes domain assets into the bin and restores them', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const created = await request(app).post('/api/sponsors').set(auth).send({
      name: 'Bin Sponsor',
      orgEmail: 'bin@example.org',
      origem: 'org_internacional',
      contact: 'Desk',
      phone: '1100000000',
    });
    expect(created.status).toBe(201);
    const id = created.body._id;

    const removed = await request(app).delete(`/api/sponsors/${id}`).set(auth);
    expect(removed.status).toBe(200);
    expect(removed.body.message).toMatch(/recycle bin/i);

    const missing = await request(app).get(`/api/sponsors/${id}`).set(auth);
    expect(missing.status).toBe(404);

    const listed = await request(app).get('/api/sponsors').set(auth);
    expect(listed.body.items.some((row) => row._id === id)).toBe(false);

    const bin = await request(app).get('/api/bin?type=SPONSOR').set(auth);
    expect(bin.status).toBe(200);
    expect(bin.body.items).toHaveLength(1);
    expect(bin.body.items[0]).toMatchObject({ itemType: 'SPONSOR', _id: id, name: 'Bin Sponsor' });

    const restored = await request(app).post(`/api/bin/SPONSOR/${id}/restore`).set(auth);
    expect(restored.status).toBe(200);

    const again = await request(app).get(`/api/sponsors/${id}`).set(auth);
    expect(again.status).toBe(200);
    expect(again.body.name).toBe('Bin Sponsor');
  });

  it('prevents a trashed user from logging in and restores unless the email is reused', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const created = await request(app).post('/api/users').set(auth).send({
      username: 'carol',
      email: 'carol@example.com',
      password: 'Password123!',
    });
    expect(created.status).toBe(201);
    const userId = created.body._id;

    const self = await request(app)
      .delete(`/api/users/${admin.adminUser._id}`)
      .set(auth);
    expect(self.status).toBe(400);

    const removed = await request(app).delete(`/api/users/${userId}`).set(auth);
    expect(removed.status).toBe(200);

    const loginDenied = await request(app).post('/api/auth/login').send({
      email: 'carol@example.com',
      password: 'Password123!',
    });
    expect(loginDenied.status).toBe(401);

    const users = await request(app).get('/api/users').set(auth);
    expect(users.body.items.some((row) => row._id === userId || row.email === 'carol@example.com')).toBe(
      false
    );

    const restored = await request(app).post(`/api/bin/USER/${userId}/restore`).set(auth);
    expect(restored.status).toBe(200);

    const loginOk = await request(app).post('/api/auth/login').send({
      email: 'carol@example.com',
      password: 'Password123!',
    });
    expect(loginOk.status).toBe(200);

    await request(app).delete(`/api/users/${userId}`).set(auth);
    const reuse = await request(app).post('/api/users').set(auth).send({
      username: 'carol2',
      email: 'carol@example.com',
      password: 'Password123!',
    });
    expect(reuse.status).toBe(201);

    const conflict = await request(app).post(`/api/bin/USER/${userId}/restore`).set(auth);
    expect(conflict.status).toBe(409);
  });

  it('blocks trashing the admin group and restores members and permissions', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const adminGroup = await Group.findOne({ name: 'admin' });
    const denyAdmin = await request(app).delete(`/api/groups/${adminGroup._id}`).set(auth);
    expect(denyAdmin.status).toBe(400);

    const created = await request(app).post('/api/groups').set(auth).send({
      name: 'editors',
      description: 'Can edit',
    });
    const groupId = created.body._id;

    const addMember = await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set(auth)
      .send({ targetUserId: viewer.user._id });
    expect(addMember.status).toBe(200);

    const setPermissions = await request(app)
      .post(`/api/groups/${groupId}/permissions`)
      .set(auth)
      .send({
        scopes: ['READ'],
        resourceType: 'SURVEY',
        allObjects: true,
      });
    expect(setPermissions.status).toBe(200);
    const permissionCount = await Permission.countDocuments({
      $or: [{ principalType: 'GROUP', principalId: groupId }, { groupId }],
    });
    expect(permissionCount).toBeGreaterThan(0);

    const removed = await request(app).delete(`/api/groups/${groupId}`).set(auth);
    expect(removed.status).toBe(200);

    const missing = await request(app).get(`/api/groups/${groupId}`).set(auth);
    expect(missing.status).toBe(404);

    const restored = await request(app).post(`/api/bin/GROUP/${groupId}/restore`).set(auth);
    expect(restored.status).toBe(200);

    const group = await request(app).get(`/api/groups/${groupId}`).set(auth);
    expect(group.status).toBe(200);
    expect(group.body.members.map(String)).toContain(String(viewer.user._id));

    const afterRestore = await Permission.countDocuments({
      $or: [{ principalType: 'GROUP', principalId: groupId }, { groupId }],
    });
    expect(afterRestore).toBe(permissionCount);
  });

  it('purges survey responses only when the survey is permanently deleted', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const { county } = await seedCounty();
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Pulse',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    expect(survey.status).toBe(201);
    const questionId = survey.body.questions[0].questionId;

    const response = await request(app)
      .post(`/api/surveys/${survey.body._id}/responses`)
      .set(auth)
      .send({
        subjectType: 'COUNTY',
        subjectId: county._id,
        answers: [{ questionId, value: 'Yes' }],
      });
    expect(response.status).toBe(201);

    await request(app).delete(`/api/surveys/${survey.body._id}`).set(auth);
    expect(await InstrumentResponse.countDocuments({ instrumentId: survey.body._id })).toBe(1);

    const missing = await request(app).get(`/api/surveys/${survey.body._id}`).set(auth);
    expect(missing.status).toBe(404);

    await request(app).delete(`/api/bin/SURVEY/${survey.body._id}`).set(auth);
    expect(await InstrumentResponse.countDocuments({ instrumentId: survey.body._id })).toBe(0);
  });

  it('lists trashed survey answers and restores them from the bin', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const { county } = await seedCounty({ name: 'Answer Bin' });
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Answer Pulse',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    expect(survey.status).toBe(201);
    const questionId = survey.body.questions[0].questionId;
    const path = `/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`;
    const saved = await request(app).put(path).set(auth).send({
      answers: [{ questionId, value: 'Yes' }],
    });
    expect(saved.status).toBe(200);

    const removed = await request(app).delete(path).set(auth);
    expect(removed.status).toBe(200);

    const bin = await request(app).get('/api/bin?type=SURVEY_ANSWER').set(auth);
    expect(bin.status).toBe(200);
    expect(bin.body.items).toHaveLength(1);
    expect(bin.body.items[0].itemType).toBe('SURVEY_ANSWER');
    expect(bin.body.items[0]._id).toBe(saved.body._id);

    const restored = await request(app)
      .post(`/api/bin/SURVEY_ANSWER/${saved.body._id}/restore`)
      .set(auth);
    expect(restored.status).toBe(200);

    const empty = await request(app).get('/api/bin?type=SURVEY_ANSWER').set(auth);
    expect(empty.body.items).toHaveLength(0);

    const again = await request(app).get(path).set(auth);
    expect(again.status).toBe(200);
    expect(again.body._id).toBe(saved.body._id);
  });

  it('empties a mixed recycle bin and purges stored files with their owner', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const sponsor = await createSponsor(app, adminToken);
    const opportunity = await request(app)
      .post('/api/opportunities')
      .set(auth)
      .send({
        name: 'Climate call',
        description: 'Window',
        sponsor: sponsor._id,
        type: 'financial',
        category: 'call',
        eligibility: 'municipal_public_administration',
        website: 'https://example.org/call',
        submissionMethod: 'Online form',
        startDate: '2026-01-01',
        budget: 100000,
      });
    expect(opportunity.status).toBe(201);

    const uploaded = await request(app)
      .post(`/api/opportunities/${opportunity.body._id}/files`)
      .set(auth)
      .attach('file', pdfBuffer(), { filename: 'guidelines.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
    const fileId = uploaded.body.items[0]._id;

    const extraUser = await request(app).post('/api/users').set(auth).send({
      username: 'to-bin',
      email: 'to-bin@example.com',
      password: 'Password123!',
    });
    const extraGroup = await request(app).post('/api/groups').set(auth).send({ name: 'to-bin-group' });

    await request(app).delete(`/api/files/${fileId}`).set(auth);
    await request(app).delete(`/api/opportunities/${opportunity.body._id}`).set(auth);
    await request(app).delete(`/api/sponsors/${sponsor._id}`).set(auth);
    await request(app).delete(`/api/users/${extraUser.body._id}`).set(auth);
    await request(app).delete(`/api/groups/${extraGroup.body._id}`).set(auth);

    const bin = await request(app).get('/api/bin').set(auth);
    expect(bin.status).toBe(200);
    expect(bin.body.items.length).toBeGreaterThanOrEqual(5);
    const types = bin.body.items.map((row) => row.itemType);
    expect(types).toEqual(expect.arrayContaining(['FILE', 'OPPORTUNITY', 'SPONSOR', 'USER', 'GROUP']));

    const emptied = await request(app).delete('/api/bin').set(auth);
    expect(emptied.status).toBe(200);
    expect(emptied.body.deleted).toBeGreaterThanOrEqual(4);

    const emptyList = await request(app).get('/api/bin').set(auth);
    expect(emptyList.body.items).toHaveLength(0);
    expect(await StoredFile.countDocuments({ _id: fileId })).toBe(0);
    expect(await User.countDocuments({ _id: extraUser.body._id })).toBe(0);
    expect(await Group.countDocuments({ _id: extraGroup.body._id })).toBe(0);
  });
});
