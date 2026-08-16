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
const { Region, State, MicroRegion, Biome, County, GeoMalha } = require('../api/models/geo');

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

describe('IBGE malhas proxy', () => {
  let app;
  let adminToken;
  let viewerToken;
  let fetchMock;

  const { clearMalhasCache } = require('../api/controllers/malhasController');

  const SAMPLE_GEOJSON = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-49.2, -16.8],
              [-49.1, -16.8],
              [-49.1, -16.7],
              [-49.2, -16.7],
              [-49.2, -16.8],
            ],
          ],
        },
      },
    ],
  };

  beforeAll(async () => {
    await connectTestDatabase();
    app = createTestApp();
  }, 120000);

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    clearMalhasCache();
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(SAMPLE_GEOJSON),
    });

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
  });

  afterEach(() => {
    fetchMock.mockRestore();
    clearMalhasCache();
  });

  it('rejects unauthenticated malha requests', async () => {
    const res = await request(app).get('/api/geo/malhas/county/5200050');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');

    const stats = await request(app).get('/api/geo/malhas/stats');
    expect(stats.status).toBe(401);

    const sync = await request(app).post('/api/geo/malhas/sync').send({});
    expect(sync.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid kind', async () => {
    const res = await request(app)
      .get('/api/geo/malhas/biome/AMZ')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows a verified user to fetch a county malha and caches the IBGE response', async () => {
    const first = await request(app)
      .get('/api/geo/malhas/county/5200050')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(first.status).toBe(200);
    expect(first.body.type).toBe('FeatureCollection');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /malhas\/municipios\/5200050\?.*formato=application%2Fvnd\.geo%2Bjson/
    );

    const second = await request(app)
      .get('/api/geo/malhas/county/5200050')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps region letter codes to IBGE ids', async () => {
    const res = await request(app)
      .get('/api/geo/malhas/region/CO')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toMatch(/malhas\/regioes\/5\?/);
  });

  it('serves Mongo cache after in-memory cache is cleared', async () => {
    const first = await request(app)
      .get('/api/geo/malhas/county/5200050')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(first.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clearMalhasCache();

    const stored = await GeoMalha.findOne({ kind: 'county', ibgeId: '5200050' }).lean();
    expect(stored).toEqual(
      expect.objectContaining({
        kind: 'county',
        ibgeId: '5200050',
      })
    );
    expect(stored.geojson.type).toBe('FeatureCollection');

    const second = await request(app)
      .get('/api/geo/malhas/county/5200050')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(second.status).toBe(200);
    expect(second.body.type).toBe('FeatureCollection');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a stored malha when IBGE is unreachable (stale-ok)', async () => {
    await GeoMalha.create({
      kind: 'state',
      ibgeId: 'GO',
      geojson: SAMPLE_GEOJSON,
      fetchedAt: new Date(),
    });
    fetchMock.mockRejectedValue(new Error('network down'));

    const res = await request(app)
      .get('/api/geo/malhas/state/GO')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forbids unprivileged users from map cache stats and sync', async () => {
    const stats = await request(app)
      .get('/api/geo/malhas/stats')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(stats.status).toBe(403);

    const sync = await request(app)
      .post('/api/geo/malhas/sync')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({});
    expect(sync.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets an admin sync catalog malhas from IBGE and skip cached rows', async () => {
    await Region.create({ _id: REGION_N, code: 'N', name: 'Norte', isDeleted: false });
    await State.create({
      _id: STATE_AC,
      code: 'AC',
      name: 'Acre',
      region: REGION_N,
      isDeleted: false,
    });
    await County.create({
      name: 'Rio Branco',
      state: STATE_AC,
      IBGECode: '1200401',
      isDeleted: false,
    });

    const first = await request(app)
      .post('/api/geo/malhas/sync')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(first.status).toBe(200);
    expect(first.body).toEqual(
      expect.objectContaining({
        done: true,
        fetched: 3,
        skipped: 0,
        failed: 0,
        remaining: 0,
        catalog: 3,
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const stats = await request(app)
      .get('/api/geo/malhas/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(stats.status).toBe(200);
    expect(stats.body.cached).toEqual({ region: 1, state: 1, county: 1 });
    expect(stats.body.catalog).toEqual({ region: 1, state: 1, county: 1 });

    const second = await request(app)
      .post('/api/geo/malhas/sync')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(second.status).toBe(200);
    expect(second.body.fetched).toBe(0);
    expect(second.body.skipped).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const forced = await request(app)
      .post('/api/geo/malhas/sync')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ force: true });
    expect(forced.status).toBe(200);
    expect(forced.body.fetched).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
