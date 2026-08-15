/**
 * @jest-environment node
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const request = require('supertest');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
  createTestApp,
  seedAdminUser,
  seedUnprivilegedUser,
} = require('./helpers/apiTestUtils');
const { Region, State, MicroRegion, Biome } = require('../api/models/geo');

const REGION_N = new mongoose.Types.ObjectId('67a901807b83a190fbc9225d');
const REGION_NE = new mongoose.Types.ObjectId('67a901807b83a190fbc9225e');
const STATE_AC = new mongoose.Types.ObjectId('67a901807b83a190fbc92283');
const STATE_BA = new mongoose.Types.ObjectId('67a901807b83a190fbc9228b');
const MICRO_AC = new mongoose.Types.ObjectId('67a901807b83a190fbc92269');
const BIOME_AMZ = new mongoose.Types.ObjectId('67a901807b83a190fbc92262');
const UNKNOWN_ID = '67a901807b83a190fbc9ffff';

async function seedGeoFixtures() {
  await Region.create([
    { _id: REGION_N, code: 'N', name: 'Norte', isDeleted: false },
    { _id: REGION_NE, code: 'NE', name: 'Nordeste', isDeleted: false },
    { code: 'XX', name: 'Deleted region', isDeleted: true },
  ]);
  await State.create([
    { _id: STATE_AC, code: 'AC', name: 'Acre', region: REGION_N, isDeleted: false },
    { _id: STATE_BA, code: 'BA', name: 'Bahia', region: REGION_NE, isDeleted: false },
  ]);
  await MicroRegion.create([
    {
      _id: MICRO_AC,
      code: 'AC01',
      name: 'Rio Branco',
      region: REGION_N,
      state: STATE_AC,
      isDeleted: false,
    },
    {
      name: 'Salvador',
      region: REGION_NE,
      state: STATE_BA,
      isDeleted: false,
    },
  ]);
  await Biome.create([
    { _id: BIOME_AMZ, code: 'AMZ', name: 'Amazônia', isDeleted: false },
    { code: 'CER', name: 'Cerrado', isDeleted: false },
  ]);
}

describe('Geography catalog API', () => {
  let app;
  let adminToken;
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

    await seedAdminUser({
      username: 'admin',
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });
    const adminLogin = await request(app).post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;

    const viewer = await seedUnprivilegedUser();
    const viewerLogin = await request(app).post('/api/auth/login').send({
      email: viewer.user.email,
      password: viewer.password,
    });
    expect(viewerLogin.status).toBe(200);
    viewerToken = viewerLogin.body.token;

    await seedGeoFixtures();
  });

  it('rejects unauthenticated list and get requests', async () => {
    const list = await request(app).get('/api/regions');
    expect(list.status).toBe(401);
    expect(list.body.code).toBe('NO_TOKEN');

    const detail = await request(app).get(`/api/states/${STATE_AC}`);
    expect(detail.status).toBe(401);
  });

  it('allows admin and unprivileged users to list and get catalog rows', async () => {
    const adminList = await request(app)
      .get('/api/regions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminList.status).toBe(200);
    expect(adminList.body.items).toHaveLength(2);
    expect(adminList.body.items.map((row) => row.code).sort()).toEqual(['N', 'NE']);

    const viewerList = await request(app)
      .get('/api/states?sort=code&order=asc')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerList.status).toBe(200);
    expect(viewerList.body.items).toHaveLength(2);
    expect(viewerList.body.items[0].code).toBe('AC');
    expect(viewerList.body.items[0].region).toEqual(
      expect.objectContaining({ code: 'N', name: 'Norte' })
    );

    const viewerGet = await request(app)
      .get(`/api/microregions/${MICRO_AC}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerGet.status).toBe(200);
    expect(viewerGet.body).toEqual(
      expect.objectContaining({
        code: 'AC01',
        name: 'Rio Branco',
      })
    );
    expect(viewerGet.body.state).toEqual(expect.objectContaining({ code: 'AC' }));
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .get(`/api/regions/${UNKNOWN_ID}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns paginated list shape and honors filters', async () => {
    const page = await request(app)
      .get('/api/microregions?page=1&limit=1&sort=name&order=asc')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page.status).toBe(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.pagination).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
        hasPrev: false,
        hasNext: true,
      })
    );
    expect(page.body.sort).toEqual({ field: 'name', order: 'asc' });

    const filtered = await request(app)
      .get(`/api/states?regionId=${REGION_NE}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].code).toBe('BA');

    const search = await request(app)
      .get('/api/microregions?q=branco')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(search.status).toBe(200);
    expect(search.body.items).toHaveLength(1);
    expect(search.body.items[0].code).toBe('AC01');
  });

  it('lists and gets biomes for authenticated users', async () => {
    const list = await request(app)
      .get('/api/biomes?sort=code&order=asc')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items.map((row) => row.code)).toEqual(['AMZ', 'CER']);

    const detail = await request(app)
      .get(`/api/biomes/${BIOME_AMZ}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.name).toBe('Amazônia');
  });
});
