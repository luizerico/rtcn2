/**
 * @jest-environment node
 *
 * Versioned survey instruments: embedded questions, publish immutability, subject upsert,
 * revision history, and COUNTY vs PROJECT allow/deny.
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.FILE_STORAGE_DRIVER = 'tmp';

const fs = require('fs');
const os = require('os');
const nodePath = require('path');
process.env.FILE_STORAGE_TMP_DIR = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'rtcn-survey-files-'));

const request = require('supertest');
const Group = require('../api/models/Group');
const Survey = require('../api/models/assets/Survey');
const { InstrumentVersion, InstrumentResponse, InstrumentRevision } = require('../api/models/survey');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
  createTestApp,
  seedAdminUser,
  seedUnprivilegedUser,
  seedCounty,
} = require('./helpers/apiTestUtils');
const { replaceGroupPermissions } = require('../api/services/rbacService');
const { resetStorageDriverForTests } = require('../api/services/storage');
const { pdfBuffer } = require('./helpers/fileFixtures');

async function login(app, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

describe('Versioned survey instruments', () => {
  let app;
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
    await seedAdminUser({
      username: 'admin',
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });
    adminToken = await login(app, 'admin@example.com', 'AdminPassword123!');
    viewer = await seedUnprivilegedUser({
      username: 'viewer',
      email: 'viewer@example.com',
      password: 'Password123!',
    });
    viewerToken = await login(app, 'viewer@example.com', 'Password123!');
  });

  it('embeds questions on create and lists surveys without hydrating the questions array', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const created = await request(app).post('/api/surveys').set(auth).send({
      name: 'Mobility check',
      questions: [
        {
          code: 'GT11',
          area: 'GT',
          prompt: 'Has a mobility plan?',
          type: 'score',
          maxPoints: 2,
          weight: 3,
        },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.questions[0].code).toBe('GT11');
    expect(created.body.questions[0].questionId).toBeTruthy();
    expect(created.body.questionCount).toBe(1);

    const listed = await request(app).get('/api/surveys').set(auth);
    expect(listed.status).toBe(200);
    const row = listed.body.items.find((item) => item.name === 'Mobility check');
    expect(row).toBeTruthy();
    expect(row.questionCount).toBe(1);
    expect(row.questions).toBeUndefined();

    const found = await request(app).get('/api/surveys').query({ search: 'mobility plan' }).set(auth);
    expect(found.body.items.some((item) => item.name === 'Mobility check')).toBe(true);

    const denied = await request(app)
      .post('/api/surveys')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Nope', questions: [{ prompt: 'X', type: 'text' }] });
    expect(denied.status).toBe(403);
  });

  it('keeps one sheet per subject and grows revision on each save', async () => {
    const { county } = await seedCounty();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Pulse',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    expect(survey.status).toBe(201);
    const questionId = survey.body.questions[0].questionId;
    const path = `/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`;

    const first = await request(app).put(path).set(auth).send({
      answers: [{ questionId, value: 'Yes' }],
    });
    expect(first.status).toBe(200);
    expect(first.body.revision).toBe(1);

    const second = await request(app).put(path).set(auth).send({
      answers: [{ questionId, value: 'No' }],
    });
    expect(second.status).toBe(200);
    expect(second.body.revision).toBe(2);
    expect(second.body._id).toBe(first.body._id);

    expect(
      await InstrumentResponse.countDocuments({
        instrumentId: survey.body._id,
        subjectId: county._id,
      })
    ).toBe(1);

    const history = await request(app).get(`${path}/revisions`).set(auth);
    expect(history.status).toBe(200);
    expect(history.body.items).toHaveLength(2);
    expect(history.body.items.map((row) => row.revision)).toEqual([1, 2]);
  });

  it('freezes published questions so draft edits do not rewrite history', async () => {
    const { county } = await seedCounty();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Frozen',
      questions: [{ code: 'P1', prompt: 'Original prompt', type: 'text' }],
      countyIds: [county._id],
    });
    expect(survey.status).toBe(201);
    expect(survey.body.currentVersion).toBe(1);
    const question = survey.body.questions[0];

    await request(app)
      .put(`/api/surveys/${survey.body._id}`)
      .set(auth)
      .send({
        questions: [
          {
            _id: question.questionId,
            questionId: question.questionId,
            code: 'P1',
            prompt: 'Edited prompt',
            type: 'text',
          },
        ],
      });

    const sheet = await request(app)
      .get(`/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`)
      .set(auth);
    expect(sheet.status).toBe(200);
    expect(sheet.body.questions[0].prompt).toBe('Original prompt');

    await request(app).post(`/api/surveys/${survey.body._id}/publish`).set(auth);
    const stillPinned = await request(app)
      .get(`/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`)
      .set(auth);
    expect(stillPinned.body.version).toBe(1);
    expect(stillPinned.body.questions[0].prompt).toBe('Original prompt');

    const moved = await request(app)
      .put(`/api/surveys/${survey.body._id}/counties/${county._id}`)
      .set(auth)
      .send({ version: 2 });
    expect(moved.status).toBe(200);

    const v2 = await request(app)
      .get(`/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`)
      .set(auth);
    expect(v2.body.version).toBe(2);
    expect(v2.body.questions[0].prompt).toBe('Edited prompt');

    const versions = await InstrumentVersion.find({ instrumentId: survey.body._id }).sort({
      version: 1,
    });
    expect(versions).toHaveLength(2);
    expect(versions[0].items[0].prompt).toBe('Original prompt');
    expect(versions[0].items[0].questionRevision).toBe(1);
    expect(versions[1].items[0].questionRevision).toBe(2);

    const detail = await request(app).get(`/api/surveys/${survey.body._id}`).set(auth);
    expect(detail.status).toBe(200);
    expect(detail.body.questions[0].revision).toBe(2);
    expect(detail.body.questions[0].questionId).toBe(question.questionId);
  });

  it('lets admins choose which published version new answers use', async () => {
    const { county } = await seedCounty({ name: 'Started' });
    const { county: other } = await seedCounty({ name: 'Fresh' });
    const { county: later } = await seedCounty({ name: 'Later' });
    const auth = { Authorization: `Bearer ${adminToken}` };
    const created = await request(app).post('/api/surveys').set(auth).send({
      name: 'Version pick',
      questions: [{ code: 'P1', prompt: 'Original prompt', type: 'text' }],
      countyIds: [county._id, other._id],
    });
    expect(created.status).toBe(201);
    expect(created.body.versions).toHaveLength(1);
    expect(created.body.versions[0].active).toBe(true);
    const question = created.body.questions[0];

    await request(app)
      .put(`/api/surveys/${created.body._id}`)
      .set(auth)
      .send({
        questions: [
          {
            _id: question.questionId,
            questionId: question.questionId,
            code: 'P1',
            prompt: 'Edited prompt',
            type: 'text',
          },
        ],
      });
    const published = await request(app).post(`/api/surveys/${created.body._id}/publish`).set(auth);
    expect(published.status).toBe(200);
    expect(published.body.currentVersion).toBe(2);
    expect(published.body.versions).toHaveLength(2);
    const v1 = published.body.versions.find((row) => row.version === 1);
    const v2 = published.body.versions.find((row) => row.version === 2);
    expect(v1).toBeTruthy();
    expect(v2).toBeTruthy();

    const denied = await request(app)
      .put(`/api/surveys/${created.body._id}/counties/${county._id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ versionId: v2._id });
    expect(denied.status).toBe(403);

    const countyOnV2 = await request(app)
      .put(`/api/surveys/${created.body._id}/counties/${county._id}`)
      .set(auth)
      .send({ versionId: v2._id });
    expect(countyOnV2.status).toBe(200);

    const listed = await request(app).get(`/api/surveys/${created.body._id}/counties`).set(auth);
    expect(listed.status).toBe(200);
    const startedRow = listed.body.items.find((row) => row._id === String(county._id));
    const freshRow = listed.body.items.find((row) => row._id === String(other._id));
    expect(startedRow.version).toBe(2);
    expect(freshRow.version).toBe(1);

    const started = await request(app)
      .put(`/api/surveys/${created.body._id}/subjects/COUNTY/${county._id}`)
      .set(auth)
      .send({ answers: [{ questionId: question.questionId, value: 'On v2' }] });
    expect(started.status).toBe(200);
    expect(started.body.version).toBe(2);

    const locked = await request(app)
      .put(`/api/surveys/${created.body._id}/counties/${county._id}`)
      .set(auth)
      .send({ versionId: v1._id });
    expect(locked.status).toBe(400);

    const existing = await request(app)
      .get(`/api/surveys/${created.body._id}/subjects/COUNTY/${county._id}`)
      .set(auth);
    expect(existing.body.version).toBe(2);
    expect(existing.body.questions[0].prompt).toBe('Edited prompt');

    const fresh = await request(app)
      .get(`/api/surveys/${created.body._id}/subjects/COUNTY/${other._id}`)
      .set(auth);
    expect(fresh.status).toBe(200);
    expect(fresh.body.version).toBe(1);
    expect(fresh.body.questions[0].prompt).toBe('Original prompt');

    const switchedDefault = await request(app)
      .put(`/api/surveys/${created.body._id}/active-version`)
      .set(auth)
      .send({ versionId: v1._id });
    expect(switchedDefault.status).toBe(200);
    expect(switchedDefault.body.currentVersion).toBe(1);

    const assignedLater = await request(app)
      .put(`/api/surveys/${created.body._id}/counties`)
      .set(auth)
      .send({ countyIds: [county._id, other._id, later._id] });
    expect(assignedLater.status).toBe(200);

    const laterSheet = await request(app)
      .get(`/api/surveys/${created.body._id}/subjects/COUNTY/${later._id}`)
      .set(auth);
    expect(laterSheet.status).toBe(200);
    expect(laterSheet.body.version).toBe(1);
  });

  it('denies fill without COUNTY access and allows instance COUNTY:WRITE', async () => {
    const { county } = await seedCounty({ name: 'Granted' });
    const survey = await request(app)
      .post('/api/surveys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Diag',
        questions: [{ prompt: 'Ok?', type: 'yes_no' }],
        countyIds: [county._id],
      });
    const questionId = survey.body.questions[0].questionId;

    const denied = await request(app)
      .put(`/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ answers: [{ questionId, value: 'Yes' }] });
    expect(denied.status).toBe(403);

    const group = await Group.create({
      name: 'county-writers',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'WRITE',
      },
      {
        groupId: group._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'READ',
      },
      {
        groupId: group._id,
        resourceType: 'SURVEY',
        target: survey.body.name,
        resourceId: survey.body._id,
        permission: 'READ',
      },
    ]);
    const token = await login(app, 'viewer@example.com', 'Password123!');
    const allowed = await request(app)
      .put(`/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId, value: 'Yes' }] });
    expect(allowed.status).toBe(200);

    const instruments = await request(app)
      .get(`/api/counties/${county._id}/instruments`)
      .set('Authorization', `Bearer ${token}`);
    expect(instruments.status).toBe(200);
    expect(instruments.body.items.some((row) => row.response && row.response.revision === 1)).toBe(
      true
    );
  });

  it('authorizes project subjects with PROJECT:WRITE rather than COUNTY', async () => {
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const sponsor = await request(app).post('/api/sponsors').set(adminAuth).send({
      name: 'FONPLATA',
      orgEmail: 'ops@example.org',
      origem: 'org_internacional',
      contact: 'Ops',
      phone: '1100000000',
    });
    const opportunity = await request(app).post('/api/opportunities').set(adminAuth).send({
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
    const project = await request(app).post('/api/projects').set(adminAuth).send({
      name: 'River basin plan',
      description: 'Implementation phase',
      opportunity: opportunity.body._id,
      projWebsite: 'https://example.org/project',
      projStartDate: '2026-03-01',
      projBudget: 25000,
      projStatus: 'in-progress',
    });
    expect(project.status).toBe(201);

    const survey = await request(app).post('/api/surveys').set(adminAuth).send({
      name: 'Project poll',
      questions: [{ prompt: 'On track?', type: 'yes_no' }],
    });
    const questionId = survey.body.questions[0].questionId;
    const path = `/api/surveys/${survey.body._id}/subjects/PROJECT/${project.body._id}`;

    const denied = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ answers: [{ questionId, value: 'Yes' }] });
    expect(denied.status).toBe(403);

    const group = await Group.create({
      name: 'project-writers',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'PROJECT',
        target: project.body.name,
        resourceId: project.body._id,
        permission: 'WRITE',
      },
      {
        groupId: group._id,
        resourceType: 'PROJECT',
        target: project.body.name,
        resourceId: project.body._id,
        permission: 'READ',
      },
      {
        groupId: group._id,
        resourceType: 'SURVEY',
        target: survey.body.name,
        resourceId: survey.body._id,
        permission: 'READ',
      },
    ]);
    const token = await login(app, 'viewer@example.com', 'Password123!');
    const allowed = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId, value: 'Yes' }] });
    expect(allowed.status).toBe(200);
    expect(allowed.body.subjectType).toBe('PROJECT');
  });

  it('scores diagnostic items and stores a letter grade', async () => {
    const { county } = await seedCounty();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Avaliacao Geral',
      instrumentType: 'scored_diagnostic',
      countyIds: [county._id],
      questions: [
        { code: 'GT11', prompt: 'Plan?', type: 'score', maxPoints: 2, weight: 1, area: 'GT' },
      ],
    });
    const questionId = survey.body.questions[0].questionId;
    const saved = await request(app)
      .put(`/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`)
      .set(auth)
      .send({ answers: [{ questionId, value: 2 }] });
    expect(saved.status).toBe(200);
    expect(saved.body.computedScore.letter).toBe('A');
    expect(saved.body.computedScore.total).toBe(2);
    expect(await InstrumentRevision.countDocuments({ responseId: saved.body._id })).toBe(1);
  });

  it('requires SURVEY:READ in addition to COUNTY:CREATE for filling', async () => {
    const { county } = await seedCounty({ name: 'County only' });
    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Dual gate',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    const questionId = survey.body.questions[0].questionId;
    const group = await Group.create({
      name: 'county-only',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'WRITE',
      },
      {
        groupId: group._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'READ',
      },
    ]);
    const token = await login(app, 'viewer@example.com', 'Password123!');
    const denied = await request(app)
      .put(`/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId, value: 'Yes' }] });
    expect(denied.status).toBe(403);
  });

  it('rejects county sheets when the county is not on countyIds', async () => {
    const { county } = await seedCounty({ name: 'Assigned' });
    const { county: other } = await seedCounty({ name: 'Unassigned' });
    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Scoped counties',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    expect(survey.body.countyIds).toEqual([String(county._id)]);

    const blocked = await request(app)
      .get(`/api/surveys/${survey.body._id}/subjects/COUNTY/${other._id}`)
      .set(auth);
    expect(blocked.status).toBe(403);

    const listed = await request(app).get(`/api/counties/${other._id}/instruments`).set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((row) => row.instrument._id === survey.body._id)).toBe(false);

    const assigned = await request(app).get(`/api/counties/${county._id}/instruments`).set(auth);
    expect(assigned.body.items.some((row) => row.instrument._id === survey.body._id)).toBe(true);
  });

  it('updates assigned counties without publishing a new version', async () => {
    const { county: first } = await seedCounty({ name: 'County A' });
    const { county: second } = await seedCounty({ name: 'County B' });
    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Assign later',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [first._id],
    });
    expect(survey.status).toBe(201);
    expect(survey.body.currentVersion).toBe(1);

    const updated = await request(app)
      .put(`/api/surveys/${survey.body._id}/counties`)
      .set(auth)
      .send({ countyIds: [first._id, second._id] });
    expect(updated.status).toBe(200);
    expect(updated.body.currentVersion).toBe(1);
    expect([...updated.body.countyIds].sort()).toEqual(
      [String(first._id), String(second._id)].sort()
    );

    const versions = await InstrumentVersion.find({ instrumentId: survey.body._id });
    expect(versions).toHaveLength(1);

    const denied = await request(app)
      .put(`/api/surveys/${survey.body._id}/counties`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ countyIds: [first._id] });
    expect(denied.status).toBe(403);
  });

  it('lists assigned counties and bulk assigns or unassigns by geography', async () => {
    const Biome = require('../api/models/geo/Biome');
    const MicroRegion = require('../api/models/geo/MicroRegion');
    const biomeA = await Biome.create({ code: 'AMZ', name: 'Amazonia' });
    const biomeB = await Biome.create({ code: 'CER', name: 'Cerrado' });
    const first = await seedCounty({ name: 'Alpha', IBGECode: '1100015', biome: biomeA });
    const second = await seedCounty({
      name: 'Beta',
      IBGECode: '1100023',
      region: first.region,
      state: first.state,
      biome: biomeA,
    });
    const other = await seedCounty({ name: 'Gamma', IBGECode: '5200050', biome: biomeB });
    const micro = await MicroRegion.create({
      name: 'Test Micro',
      code: 'M1',
      region: first.region._id,
      state: first.state._id,
    });
    await require('../api/models/geo/County').updateOne(
      { _id: first.county._id },
      { $set: { microregion: micro._id } }
    );

    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Bulk geo',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [first.county._id],
    });
    expect(survey.status).toBe(201);
    expect(survey.body.currentVersion).toBe(1);

    const listed = await request(app)
      .get(`/api/surveys/${survey.body._id}/counties?q=Alpha&sort=name&order=asc`)
      .set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0].name).toBe('Alpha');
    expect(listed.body.pagination.total).toBe(1);

    const emptySearch = await request(app)
      .get(`/api/surveys/${survey.body._id}/counties?q=Nope`)
      .set(auth);
    expect(emptySearch.body.items).toHaveLength(0);

    const deniedList = await request(app)
      .get(`/api/surveys/${survey.body._id}/counties`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(deniedList.status).toBe(403);

    const previewAssign = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk/preview`)
      .set(auth)
      .send({ action: 'assign', geoType: 'region', geoId: first.region._id });
    expect(previewAssign.status).toBe(200);
    expect(previewAssign.body.action).toBe('assign');
    expect(previewAssign.body.addCount).toBe(1);
    expect(previewAssign.body.removeCount).toBe(0);
    expect(previewAssign.body.counties.map((row) => row._id)).toEqual([String(second.county._id)]);

    const previewUnassign = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk/preview`)
      .set(auth)
      .send({ action: 'unassign', geoType: 'region', geoId: first.region._id });
    expect(previewUnassign.status).toBe(200);
    expect(previewUnassign.body.removeCount).toBe(1);
    expect(previewUnassign.body.addCount).toBe(0);
    expect(previewUnassign.body.counties.map((row) => row._id)).toEqual([String(first.county._id)]);

    const afterPreview = await request(app).get(`/api/surveys/${survey.body._id}`).set(auth);
    expect(afterPreview.status).toBe(200);
    expect(afterPreview.body.countyIds).toEqual([String(first.county._id)]);
    expect(afterPreview.body.currentVersion).toBe(1);

    const previewCounty = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk/preview`)
      .set(auth)
      .send({ action: 'assign', geoType: 'county', geoId: other.county._id });
    expect(previewCounty.status).toBe(200);
    expect(previewCounty.body.addCount).toBe(1);
    expect(previewCounty.body.counties[0]._id).toBe(String(other.county._id));

    const previewInvalid = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk/preview`)
      .set(auth)
      .send({ action: 'assign', geoType: 'continent', geoId: first.region._id });
    expect(previewInvalid.status).toBe(400);

    const deniedPreview = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk/preview`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ action: 'assign', geoType: 'region', geoId: first.region._id });
    expect(deniedPreview.status).toBe(403);

    const readers = await Group.create({
      name: 'survey-county-readers',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(readers._id, [
      {
        groupId: readers._id,
        resourceType: 'SURVEY',
        target: survey.body.name,
        resourceId: survey.body._id,
        permission: 'READ',
      },
    ]);
    const readerToken = await login(app, 'viewer@example.com', 'Password123!');
    const readerPreview = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk/preview`)
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ action: 'assign', geoType: 'region', geoId: first.region._id });
    expect(readerPreview.status).toBe(200);
    expect(readerPreview.body.addCount).toBe(1);
    const readerWrite = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ action: 'assign', geoType: 'region', geoId: first.region._id });
    expect(readerWrite.status).toBe(403);

    const assigned = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set(auth)
      .send({ action: 'assign', geoType: 'region', geoId: first.region._id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.currentVersion).toBe(1);
    expect(assigned.body.matchedCountyCount).toBe(2);
    expect([...assigned.body.countyIds].sort()).toEqual(
      [String(first.county._id), String(second.county._id)].sort()
    );

    const versions = await InstrumentVersion.find({ instrumentId: survey.body._id });
    expect(versions).toHaveLength(1);

    const byBiome = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set(auth)
      .send({ action: 'assign', geoType: 'biome', geoId: biomeB._id });
    expect(byBiome.status).toBe(200);
    expect([...byBiome.body.countyIds].sort()).toEqual(
      [String(first.county._id), String(second.county._id), String(other.county._id)].sort()
    );

    const byMicro = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set(auth)
      .send({ action: 'unassign', geoType: 'microregion', geoId: micro._id });
    expect(byMicro.status).toBe(200);
    expect(byMicro.body.countyIds).not.toContain(String(first.county._id));

    const unassigned = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set(auth)
      .send({ action: 'unassign', geoType: 'state', geoId: first.state._id });
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.countyIds).toEqual([String(other.county._id)]);

    const assignCounty = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set(auth)
      .send({ action: 'assign', geoType: 'county', geoId: first.county._id });
    expect(assignCounty.status).toBe(200);
    expect(assignCounty.body.currentVersion).toBe(1);
    expect(assignCounty.body.matchedCountyCount).toBe(1);
    expect([...assignCounty.body.countyIds].sort()).toEqual(
      [String(other.county._id), String(first.county._id)].sort()
    );

    const unassignCounty = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set(auth)
      .send({ action: 'unassign', geoType: 'county', geoId: first.county._id });
    expect(unassignCounty.status).toBe(200);
    expect(unassignCounty.body.countyIds).toEqual([String(other.county._id)]);

    const invalid = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set(auth)
      .send({ action: 'assign', geoType: 'continent', geoId: first.region._id });
    expect(invalid.status).toBe(400);

    const missing = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set(auth)
      .send({ action: 'assign', geoType: 'region', geoId: '64b0c0c0c0c0c0c0c0c0c0c0' });
    expect(missing.status).toBe(404);

    const deniedBulk = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ action: 'assign', geoType: 'region', geoId: first.region._id });
    expect(deniedBulk.status).toBe(403);
  });

  it('sorts assigned counties by region, state, biome, and microregion name', async () => {
    const Region = require('../api/models/geo/Region');
    const State = require('../api/models/geo/State');
    const Biome = require('../api/models/geo/Biome');
    const MicroRegion = require('../api/models/geo/MicroRegion');
    const County = require('../api/models/geo/County');
    const south = await Region.create({ code: 'S', name: 'South' });
    const north = await Region.create({ code: 'N', name: 'North' });
    const rioGrande = await State.create({ code: 'RS', name: 'Rio Grande', region: south._id });
    const amazonas = await State.create({ code: 'AM', name: 'Amazonas', region: north._id });
    const cerrado = await Biome.create({ code: 'CER', name: 'Cerrado' });
    const amazonia = await Biome.create({ code: 'AMZ', name: 'Amazonia' });
    const microBeta = await MicroRegion.create({
      name: 'Beta Micro',
      code: 'MB',
      region: south._id,
      state: rioGrande._id,
    });
    const microAlpha = await MicroRegion.create({
      name: 'Alpha Micro',
      code: 'MA',
      region: north._id,
      state: amazonas._id,
    });
    const porto = await seedCounty({
      name: 'Porto',
      IBGECode: '4314902',
      region: south,
      state: rioGrande,
      biome: cerrado,
    });
    const manaus = await seedCounty({
      name: 'Manaus',
      IBGECode: '1302603',
      region: north,
      state: amazonas,
      biome: amazonia,
    });
    await County.updateOne({ _id: porto.county._id }, { $set: { microregion: microBeta._id } });
    await County.updateOne({ _id: manaus.county._id }, { $set: { microregion: microAlpha._id } });

    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Geo sort',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [porto.county._id, manaus.county._id],
    });
    expect(survey.status).toBe(201);

    async function names(sort, order = 'asc') {
      const res = await request(app)
        .get(`/api/surveys/${survey.body._id}/counties?sort=${sort}&order=${order}`)
        .set(auth);
      expect(res.status).toBe(200);
      return res.body.items.map((row) => row.name);
    }

    expect(await names('region')).toEqual(['Manaus', 'Porto']);
    expect(await names('state')).toEqual(['Manaus', 'Porto']);
    expect(await names('biome')).toEqual(['Manaus', 'Porto']);
    expect(await names('microregion')).toEqual(['Manaus', 'Porto']);
    expect(await names('region', 'desc')).toEqual(['Porto', 'Manaus']);
  });

  it('intersects optional countyIds with the geography set on bulk assign and unassign', async () => {
    const first = await seedCounty({ name: 'Keep', IBGECode: '2100010' });
    const second = await seedCounty({
      name: 'Skip',
      IBGECode: '2100028',
      region: first.region,
      state: first.state,
    });
    const outsider = await seedCounty({ name: 'Outsider', IBGECode: '5200100' });
    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Pruned bulk',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [first.county._id],
    });
    expect(survey.status).toBe(201);

    const assigned = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set(auth)
      .send({
        action: 'assign',
        geoType: 'region',
        geoId: first.region._id,
        countyIds: [second.county._id, outsider.county._id],
      });
    expect(assigned.status).toBe(200);
    expect(assigned.body.currentVersion).toBe(1);
    expect(assigned.body.matchedCountyCount).toBe(2);
    expect(assigned.body.changedCount).toBe(1);
    expect([...assigned.body.countyIds].sort()).toEqual(
      [String(first.county._id), String(second.county._id)].sort()
    );

    const unassigned = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set(auth)
      .send({
        action: 'unassign',
        geoType: 'region',
        geoId: first.region._id,
        countyIds: [first.county._id, outsider.county._id],
      });
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.countyIds).toEqual([String(second.county._id)]);

    const invalid = await request(app)
      .post(`/api/surveys/${survey.body._id}/counties/bulk`)
      .set(auth)
      .send({
        action: 'assign',
        geoType: 'region',
        geoId: first.region._id,
        countyIds: ['not-an-id'],
      });
    expect(invalid.status).toBe(400);
  });

  it('allows opening an existing county sheet even if countyIds was not backfilled', async () => {
    const { county } = await seedCounty({ name: 'Imported' });
    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Legacy import',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    const questionId = survey.body.questions[0].questionId;
    const path = `/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`;
    const saved = await request(app)
      .put(path)
      .set(auth)
      .send({ answers: [{ questionId, value: 'Yes' }] });
    expect(saved.status).toBe(200);

    await Survey.updateOne({ _id: survey.body._id }, { $set: { countyIds: [] } });

    const opened = await request(app).get(path).set(auth);
    expect(opened.status).toBe(200);
    expect(opened.body._id).toBe(saved.body._id);
    expect(opened.body.answers[0].value).toBe('Yes');

    const assigned = await request(app)
      .get(`/api/surveys/${survey.body._id}/counties`)
      .set(auth);
    expect(assigned.status).toBe(200);
    expect(assigned.body.items.map((row) => row._id)).toEqual([String(county._id)]);
    expect(assigned.body.items[0].versionLocked).toBe(true);

    const responses = await request(app)
      .get(`/api/surveys/${survey.body._id}/responses`)
      .set(auth);
    expect(responses.status).toBe(200);
    expect(responses.body.responses.some((row) => row._id === saved.body._id)).toBe(true);
  });

  it('lets SURVEY:READ plus COUNTY:CREATE start a sheet and hides it from COUNTY:READ-only users', async () => {
    const { county } = await seedCounty({ name: 'Starter' });
    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Startable',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    const questionId = survey.body.questions[0].questionId;
    const path = `/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`;

    const readers = await Group.create({
      name: 'county-readers',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(readers._id, [
      {
        groupId: readers._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'READ',
      },
      {
        groupId: readers._id,
        resourceType: 'SURVEY',
        target: survey.body.name,
        resourceId: survey.body._id,
        permission: 'READ',
      },
    ]);
    const readerToken = await login(app, 'viewer@example.com', 'Password123!');
    const denied = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ answers: [{ questionId, value: 'Yes' }] });
    expect(denied.status).toBe(403);

    const starters = await Group.create({
      name: 'county-starters',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(starters._id, [
      {
        groupId: starters._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'READ',
      },
      {
        groupId: starters._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'CREATE',
      },
      {
        groupId: starters._id,
        resourceType: 'SURVEY',
        target: survey.body.name,
        resourceId: survey.body._id,
        permission: 'READ',
      },
    ]);
    const starterToken = await login(app, 'viewer@example.com', 'Password123!');
    const started = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${starterToken}`)
      .send({ answers: [{ questionId, value: 'Yes' }], status: 'in_progress' });
    expect(started.status).toBe(200);
    expect(started.body.ownerId).toBe(String(viewer.user._id));
    expect(started.body.status).toBe('in_progress');

    const completed = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${starterToken}`)
      .send({ answers: [{ questionId, value: 'No' }], status: 'approved' });
    expect(completed.status).toBe(200);

    const blocked = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${starterToken}`)
      .send({ answers: [{ questionId, value: 'Yes' }], status: 'approved' });
    expect(blocked.status).toBe(403);

    const answers = await request(app)
      .get('/api/surveys/answers')
      .set('Authorization', `Bearer ${starterToken}`);
    expect(answers.status).toBe(200);
    expect(answers.body.items.some((row) => row._id === started.body._id)).toBe(true);
  });

  it('lets COUNTY:WRITE edit an approved sheet and send it back so the owner can edit', async () => {
    const { county } = await seedCounty({ name: 'Review' });
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(adminAuth).send({
      name: 'Reviewed',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    const questionId = survey.body.questions[0].questionId;
    const path = `/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`;

    const group = await Group.create({
      name: 'county-mods',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'READ',
      },
      {
        groupId: group._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'WRITE',
      },
      {
        groupId: group._id,
        resourceType: 'SURVEY',
        target: survey.body.name,
        resourceId: survey.body._id,
        permission: 'READ',
      },
    ]);
    const reviewerToken = await login(app, 'viewer@example.com', 'Password123!');

    const created = await request(app)
      .put(path)
      .set(adminAuth)
      .send({ answers: [{ questionId, value: 'Yes' }], status: 'approved' });
    expect(created.status).toBe(200);

    const reviewed = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ answers: [{ questionId, value: 'No' }], status: 'need_changes' });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.status).toBe('need_changes');
  });

  it('hides archived sheets from non-admins', async () => {
    const { county } = await seedCounty({ name: 'Archive' });
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(adminAuth).send({
      name: 'Archivable',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    const questionId = survey.body.questions[0].questionId;
    const path = `/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`;
    await request(app)
      .put(path)
      .set(adminAuth)
      .send({ answers: [{ questionId, value: 'Yes' }], status: 'archived' });

    const group = await Group.create({
      name: 'county-see',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(group._id, [
      {
        groupId: group._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'READ',
      },
      {
        groupId: group._id,
        resourceType: 'SURVEY',
        target: survey.body.name,
        resourceId: survey.body._id,
        permission: 'READ',
      },
    ]);
    const token = await login(app, 'viewer@example.com', 'Password123!');
    const hidden = await request(app).get(path).set('Authorization', `Bearer ${token}`);
    expect(hidden.status).toBe(404);

    const listed = await request(app).get('/api/surveys/answers').set('Authorization', `Bearer ${token}`);
    expect(listed.body.items).toHaveLength(0);

    const adminList = await request(app).get('/api/surveys/answers').set(adminAuth);
    expect(adminList.body.items.some((row) => row.status === 'archived')).toBe(true);
  });

  it('filters permission list by principalType and principalId', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const all = await request(app).get('/api/permissions').set(auth);
    expect(all.status).toBe(200);
    expect(all.body.length).toBeGreaterThan(0);

    const filtered = await request(app)
      .get('/api/permissions')
      .query({ principalType: 'USER', principalId: String(viewer.user._id) })
      .set(auth);
    expect(filtered.status).toBe(200);
    expect(filtered.body.every((row) => String(row.principalId) === String(viewer.user._id))).toBe(
      true
    );
    expect(filtered.body.length).toBeLessThan(all.body.length);
  });

  it('attaches evidence files to a specific question on a saved sheet', async () => {
    const { county } = await seedCounty();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Evidence sheet',
      questions: [
        { prompt: 'First?', type: 'yes_no' },
        { prompt: 'Second?', type: 'yes_no' },
      ],
      countyIds: [county._id],
    });
    expect(survey.status).toBe(201);
    const firstId = survey.body.questions[0].questionId;
    const secondId = survey.body.questions[1].questionId;
    const path = `/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`;

    const saved = await request(app).put(path).set(auth).send({
      answers: [
        { questionId: firstId, value: 'Yes' },
        { questionId: secondId, value: 'No' },
      ],
    });
    expect(saved.status).toBe(200);

    const uploaded = await request(app)
      .post(`${path}/files`)
      .set(auth)
      .field('questionId', firstId)
      .attach('file', pdfBuffer(), { filename: 'evidence.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.items[0].questionId).toBe(firstId);

    const filtered = await request(app).get(`${path}/files`).query({ questionId: firstId }).set(auth);
    expect(filtered.status).toBe(200);
    expect(filtered.body.items).toHaveLength(1);

    const other = await request(app).get(`${path}/files`).query({ questionId: secondId }).set(auth);
    expect(other.status).toBe(200);
    expect(other.body.items).toHaveLength(0);
  });

  it('moves a sheet to the recycle bin and restores it', async () => {
    const { county } = await seedCounty({ name: 'Bin County' });
    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Bin Pulse',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    const questionId = survey.body.questions[0].questionId;
    const path = `/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`;
    const saved = await request(app).put(path).set(auth).send({
      answers: [{ questionId, value: 'Yes' }],
    });
    expect(saved.status).toBe(200);

    const denied = await request(app).delete(path).set('Authorization', `Bearer ${viewerToken}`);
    expect(denied.status).toBe(403);

    const trashed = await request(app).delete(path).set(auth);
    expect(trashed.status).toBe(200);
    expect(trashed.body.message).toMatch(/recycle bin/i);

    const listed = await request(app).get('/api/surveys/answers').set(auth);
    expect(listed.body.items.some((row) => row._id === saved.body._id)).toBe(false);

    const opened = await request(app).get(path).set(auth);
    expect(opened.status).toBe(200);
    expect(opened.body._id).toBeUndefined();
    expect(opened.body.revision).toBe(0);

    const bin = await request(app).get('/api/bin?type=SURVEY_ANSWER').set(auth);
    expect(bin.status).toBe(200);
    expect(bin.body.items).toHaveLength(1);
    expect(bin.body.items[0]).toMatchObject({
      itemType: 'SURVEY_ANSWER',
      _id: saved.body._id,
    });
    expect(bin.body.items[0].name).toMatch(/Bin Pulse/);

    const restored = await request(app)
      .post(`/api/bin/SURVEY_ANSWER/${saved.body._id}/restore`)
      .set(auth);
    expect(restored.status).toBe(200);

    const again = await request(app).get(path).set(auth);
    expect(again.status).toBe(200);
    expect(again.body._id).toBe(saved.body._id);
    expect(again.body.answers[0].value).toBe('Yes');
  });

  it('lets COUNTY:DELETE trash a sheet and blocks COUNTY:WRITE on approved sheets', async () => {
    const { county } = await seedCounty({ name: 'Deleteville' });
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(adminAuth).send({
      name: 'Deletable',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    const questionId = survey.body.questions[0].questionId;
    const path = `/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`;
    const saved = await request(app).put(path).set(adminAuth).send({
      answers: [{ questionId, value: 'Yes' }],
      status: 'approved',
    });
    expect(saved.status).toBe(200);

    const writers = await Group.create({
      name: 'county-writers-no-delete',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(writers._id, [
      {
        groupId: writers._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'READ',
      },
      {
        groupId: writers._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'WRITE',
      },
      {
        groupId: writers._id,
        resourceType: 'SURVEY',
        target: survey.body.name,
        resourceId: survey.body._id,
        permission: 'READ',
      },
    ]);
    const writerToken = await login(app, 'viewer@example.com', 'Password123!');
    const blocked = await request(app).delete(path).set('Authorization', `Bearer ${writerToken}`);
    expect(blocked.status).toBe(403);

    const deleters = await Group.create({
      name: 'county-deleters',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(deleters._id, [
      {
        groupId: deleters._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'READ',
      },
      {
        groupId: deleters._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'DELETE',
      },
      {
        groupId: deleters._id,
        resourceType: 'SURVEY',
        target: survey.body.name,
        resourceId: survey.body._id,
        permission: 'READ',
      },
    ]);
    const deleterToken = await login(app, 'viewer@example.com', 'Password123!');
    const removed = await request(app).delete(path).set('Authorization', `Bearer ${deleterToken}`);
    expect(removed.status).toBe(200);
  });

  it('lets the owner trash an in-progress sheet and refuses restore when a new sheet exists', async () => {
    const { county } = await seedCounty({ name: 'Owner Bin' });
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(adminAuth).send({
      name: 'Owner Pulse',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    const questionId = survey.body.questions[0].questionId;
    const path = `/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`;

    const starters = await Group.create({
      name: 'county-draft-owners',
      members: [viewer.user._id],
    });
    await replaceGroupPermissions(starters._id, [
      {
        groupId: starters._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'READ',
      },
      {
        groupId: starters._id,
        resourceType: 'COUNTY',
        target: county.name,
        resourceId: county._id,
        permission: 'CREATE',
      },
      {
        groupId: starters._id,
        resourceType: 'SURVEY',
        target: survey.body.name,
        resourceId: survey.body._id,
        permission: 'READ',
      },
    ]);
    const starterToken = await login(app, 'viewer@example.com', 'Password123!');
    const draft = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${starterToken}`)
      .send({ answers: [{ questionId, value: 'Yes' }], status: 'in_progress' });
    expect(draft.status).toBe(200);

    const trashed = await request(app)
      .delete(path)
      .set('Authorization', `Bearer ${starterToken}`);
    expect(trashed.status).toBe(200);

    const replacement = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${starterToken}`)
      .send({ answers: [{ questionId, value: 'No' }], status: 'in_progress' });
    expect(replacement.status).toBe(200);
    expect(replacement.body._id).not.toBe(draft.body._id);

    const conflict = await request(app)
      .post(`/api/bin/SURVEY_ANSWER/${draft.body._id}/restore`)
      .set(adminAuth);
    expect(conflict.status).toBe(409);

    await request(app).delete(path).set(adminAuth);
    const restored = await request(app)
      .post(`/api/bin/SURVEY_ANSWER/${draft.body._id}/restore`)
      .set(adminAuth);
    expect(restored.status).toBe(200);

    const approved = await request(app).put(path).set(adminAuth).send({
      answers: [{ questionId, value: 'Yes' }],
      status: 'approved',
    });
    expect(approved.status).toBe(200);
    const ownerBlocked = await request(app)
      .delete(path)
      .set('Authorization', `Bearer ${starterToken}`);
    expect(ownerBlocked.status).toBe(403);
  });

  it('permanently deletes revisions when a trashed sheet is purged', async () => {
    const { county } = await seedCounty({ name: 'Purge County' });
    const auth = { Authorization: `Bearer ${adminToken}` };
    const survey = await request(app).post('/api/surveys').set(auth).send({
      name: 'Purge Pulse',
      questions: [{ prompt: 'Ok?', type: 'yes_no' }],
      countyIds: [county._id],
    });
    const questionId = survey.body.questions[0].questionId;
    const path = `/api/surveys/${survey.body._id}/subjects/COUNTY/${county._id}`;
    const saved = await request(app).put(path).set(auth).send({
      answers: [{ questionId, value: 'Yes' }],
    });
    expect(saved.status).toBe(200);
    expect(await InstrumentRevision.countDocuments({ responseId: saved.body._id })).toBe(1);

    await request(app).delete(path).set(auth);
    const purged = await request(app).delete(`/api/bin/SURVEY_ANSWER/${saved.body._id}`).set(auth);
    expect(purged.status).toBe(200);
    expect(await InstrumentResponse.countDocuments({ _id: saved.body._id })).toBe(0);
    expect(await InstrumentRevision.countDocuments({ responseId: saved.body._id })).toBe(0);
  });
});
