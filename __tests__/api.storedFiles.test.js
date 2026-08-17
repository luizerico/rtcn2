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
const { resetStorageDriverForTests } = require('../api/services/storage');
const { pdfBuffer, pngBuffer, svgBuffer, exeBuffer } = require('./helpers/fileFixtures');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtcn-files-'));
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

describe('Opportunity stored files', () => {
  let app;
  let adminToken;
  let viewerToken;
  let viewer;
  let sponsor;
  let opportunity;

  beforeAll(async () => {
    resetStorageDriverForTests();
    await connectTestDatabase();
    app = createTestApp();
  }, 120000);

  afterAll(async () => {
    await disconnectTestDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
    const created = await request(app)
      .post('/api/opportunities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(sampleOpportunity(sponsor._id));
    expect(created.status).toBe(201);
    opportunity = created.body;
  });

  it('allows admin upload, list, download, update, and delete via tmp driver', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const uploaded = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set(auth)
      .field('displayName', 'Call PDF')
      .field('obs', 'Guidelines')
      .attach('file', pdfBuffer(), { filename: 'guidelines.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.items).toHaveLength(1);
    const stored = uploaded.body.items[0];
    expect(stored.displayName).toBe('Call PDF');
    expect(stored.originalName).toBe('guidelines.pdf');
    expect(stored.obs).toBe('Guidelines');
    expect(stored.ownerType).toBe('opportunity');
    expect(stored.storageDriver).toBe('tmp');
    expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.storageKey).toBeUndefined();

    const listed = await request(app)
      .get(`/api/opportunities/${opportunity._id}/files`)
      .set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]._id).toBe(stored._id);

    const meta = await request(app).get(`/api/files/${stored._id}`).set(auth);
    expect(meta.status).toBe(200);
    expect(meta.body.mimeType).toBe('application/pdf');

    const download = await request(app).get(`/api/files/${stored._id}/content`).set(auth);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toMatch(/pdf/);
    expect(download.headers['content-disposition']).toMatch(/attachment/);
    expect(Buffer.isBuffer(download.body) ? download.body.slice(0, 4).toString() : String(download.text).slice(0, 4)).toBe(
      '%PDF'
    );

    const patched = await request(app)
      .patch(`/api/files/${stored._id}`)
      .set(auth)
      .send({ obs: 'Updated note', displayName: 'Guidelines v2' });
    expect(patched.status).toBe(200);
    expect(patched.body.obs).toBe('Updated note');
    expect(patched.body.displayName).toBe('Guidelines v2');

    const removed = await request(app).delete(`/api/files/${stored._id}`).set(auth);
    expect(removed.status).toBe(200);
    const gone = await request(app).get(`/api/files/${stored._id}`).set(auth);
    expect(gone.status).toBe(404);

    const listedAfterDelete = await request(app)
      .get(`/api/opportunities/${opportunity._id}/files`)
      .set(auth);
    expect(listedAfterDelete.body.items).toHaveLength(0);
  });

  it('rejects exe and svg uploads', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const exe = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set(auth)
      .attach('file', exeBuffer(), { filename: 'payload.exe', contentType: 'application/octet-stream' });
    expect(exe.status).toBe(400);

    const svg = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set(auth)
      .attach('file', svgBuffer(), { filename: 'icon.svg', contentType: 'image/svg+xml' });
    expect(svg.status).toBe(400);
  });

  it('denies unprivileged users', async () => {
    const auth = { Authorization: `Bearer ${viewerToken}` };
    const list = await request(app).get(`/api/opportunities/${opportunity._id}/files`).set(auth);
    expect(list.status).toBe(403);

    const upload = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set(auth)
      .attach('file', pngBuffer(), { filename: 'shot.png', contentType: 'image/png' });
    expect(upload.status).toBe(403);
  });

  it('inherits instance-scoped opportunity READ for list and download', async () => {
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const other = await request(app)
      .post('/api/opportunities')
      .set(adminAuth)
      .send({ ...sampleOpportunity(sponsor._id), name: 'Other call' });
    expect(other.status).toBe(201);

    const uploaded = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set(adminAuth)
      .attach('file', pdfBuffer(), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
    const uploadedId = uploaded.body.items[0]._id;

    const otherFile = await request(app)
      .post(`/api/opportunities/${other.body._id}/files`)
      .set(adminAuth)
      .attach('file', pdfBuffer(), { filename: 'b.pdf', contentType: 'application/pdf' });
    expect(otherFile.status).toBe(201);
    const otherFileId = otherFile.body.items[0]._id;

    const group = await Group.create({
      name: 'opp-file-readers',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'OPPORTUNITY',
        target: opportunity.name,
        resourceId: opportunity._id,
        permission: 'READ',
      },
    ]);

    const token = await login(app, viewer.user.email, viewer.password);
    const auth = { Authorization: `Bearer ${token}` };

    const allowedList = await request(app)
      .get(`/api/opportunities/${opportunity._id}/files`)
      .set(auth);
    expect(allowedList.status).toBe(200);
    expect(allowedList.body.items).toHaveLength(1);

    const allowedDownload = await request(app).get(`/api/files/${uploadedId}/content`).set(auth);
    expect(allowedDownload.status).toBe(200);

    const deniedList = await request(app).get(`/api/opportunities/${other.body._id}/files`).set(auth);
    expect(deniedList.status).toBe(403);

    const deniedDownload = await request(app).get(`/api/files/${otherFileId}/content`).set(auth);
    expect(deniedDownload.status).toBe(403);

    const deniedWrite = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set(auth)
      .attach('file', pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    expect(deniedWrite.status).toBe(403);
  });

  it('uploads multiple files in one request', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const uploaded = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set(auth)
      .field('displayName', 'Call PDF')
      .field('displayName', 'Site photo')
      .field('obs', 'Batch notes')
      .attach('file', pdfBuffer(), { filename: 'guidelines.pdf', contentType: 'application/pdf' })
      .attach('file', pngBuffer(), { filename: 'site.png', contentType: 'image/png' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.items).toHaveLength(2);
    expect(uploaded.body.items.map((row) => row.displayName)).toEqual(['Call PDF', 'Site photo']);
    expect(uploaded.body.items.every((row) => row.obs === 'Batch notes')).toBe(true);

    const listed = await request(app)
      .get(`/api/opportunities/${opportunity._id}/files`)
      .set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(2);
  });

  it('moves deleted files to an admin-only recycle bin that can restore or purge', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const uploaded = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set(auth)
      .attach('file', pdfBuffer(), { filename: 'guidelines.pdf', contentType: 'application/pdf' });
    const fileId = uploaded.body.items[0]._id;

    const removed = await request(app).delete(`/api/files/${fileId}`).set(auth);
    expect(removed.status).toBe(200);

    const deniedBin = await request(app)
      .get('/api/files/bin')
      .set({ Authorization: `Bearer ${viewerToken}` });
    expect(deniedBin.status).toBe(403);

    const bin = await request(app).get('/api/files/bin').set(auth);
    expect(bin.status).toBe(200);
    expect(bin.body.items).toHaveLength(1);
    expect(bin.body.items[0]._id).toBe(fileId);
    expect(bin.body.items[0].deletedAt).toBeTruthy();
    expect(bin.body.items[0].ownerLabel).toBe(opportunity.name);

    const restored = await request(app).post(`/api/files/bin/${fileId}/restore`).set(auth);
    expect(restored.status).toBe(200);
    expect(restored.body.deletedAt).toBeNull();

    const listed = await request(app).get(`/api/opportunities/${opportunity._id}/files`).set(auth);
    expect(listed.body.items).toHaveLength(1);

    await request(app).delete(`/api/files/${fileId}`).set(auth);
    const purged = await request(app).delete(`/api/files/bin/${fileId}`).set(auth);
    expect(purged.status).toBe(200);
    const emptyBin = await request(app).get('/api/files/bin').set(auth);
    expect(emptyBin.body.items).toHaveLength(0);
    const gone = await request(app).get(`/api/files/${fileId}`).set(auth);
    expect(gone.status).toBe(404);
  });

  it('empties the recycle bin and denies non-admins from restore/purge', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const first = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set(auth)
      .attach('file', pdfBuffer(), { filename: 'a.pdf', contentType: 'application/pdf' });
    const second = await request(app)
      .post(`/api/opportunities/${opportunity._id}/files`)
      .set(auth)
      .attach('file', pngBuffer(), { filename: 'b.png', contentType: 'image/png' });
    const firstId = first.body.items[0]._id;
    const secondId = second.body.items[0]._id;
    await request(app).delete(`/api/files/${firstId}`).set(auth);
    await request(app).delete(`/api/files/${secondId}`).set(auth);

    const viewerAuth = { Authorization: `Bearer ${viewerToken}` };
    const deniedRestore = await request(app).post(`/api/files/bin/${firstId}/restore`).set(viewerAuth);
    expect(deniedRestore.status).toBe(403);
    const deniedPurge = await request(app).delete(`/api/files/bin/${firstId}`).set(viewerAuth);
    expect(deniedPurge.status).toBe(403);

    const emptied = await request(app).delete('/api/files/bin').set(auth);
    expect(emptied.status).toBe(200);
    expect(emptied.body.deleted).toBe(2);
    const bin = await request(app).get('/api/files/bin').set(auth);
    expect(bin.body.items).toHaveLength(0);
  });
});
