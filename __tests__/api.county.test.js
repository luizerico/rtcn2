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
const { Region, State, Biome, MicroRegion, County, CountyStatus, CountyEmission } = require('../api/models/geo');

const REGION_CO = new mongoose.Types.ObjectId('67a901807b83a190fbc92261');
const STATE_GO = new mongoose.Types.ObjectId('67a901807b83a190fbc9229b');
const BIOME_CER = new mongoose.Types.ObjectId('67a901807b83a190fbc92264');
const MICRO_GO = new mongoose.Types.ObjectId('67a901807b83a190fbc92270');
const COUNTY_A = new mongoose.Types.ObjectId('6760693b325518ff8dc09834');
const COUNTY_B = new mongoose.Types.ObjectId('6760693b325518ff8dc09835');
const UNKNOWN_ID = '67a901807b83a190fbc9ffff';

async function seedCountyFixtures() {
  await Region.create({ _id: REGION_CO, code: 'CO', name: 'Centro-Oeste', isDeleted: false });
  await State.create({
    _id: STATE_GO,
    code: 'GO',
    name: 'Goiás',
    region: REGION_CO,
    isDeleted: false,
  });
  await Biome.create({ _id: BIOME_CER, code: 'CER', name: 'Cerrado', isDeleted: false });
  await MicroRegion.create({
    _id: MICRO_GO,
    code: 'GO01',
    name: 'Goiânia',
    region: REGION_CO,
    state: STATE_GO,
    isDeleted: false,
  });
  await County.create([
    {
      _id: COUNTY_A,
      name: 'Abadia de Goiás',
      code: '0',
      IBGECode: '5200050',
      population: 19128,
      state: STATE_GO,
      region: REGION_CO,
      microregion: MICRO_GO,
      biome: BIOME_CER,
      isDeleted: false,
    },
    {
      _id: COUNTY_B,
      name: 'Other Town',
      IBGECode: '5200100',
      state: STATE_GO,
      region: REGION_CO,
      isDeleted: false,
    },
  ]);
  await CountyStatus.create({
    _id: COUNTY_A,
    county: COUNTY_A,
    hidroRisk: [
      { value: 0.19, year: 2015 },
      { value: 0.18, year: 2030 },
    ],
    disasterRate: [{ value: 0.35, year: 2015 }],
    endangeredPeople: [{ value: 12, year: 2020, riskType: 'flood' }],
    isDeleted: false,
  });
  await CountyEmission.create([
    {
      county: COUNTY_A,
      year: 2022,
      sector: 'Agropecuária',
      category: 'Cultivo de arroz',
      product: 'Arroz',
      value: 10,
    },
    {
      county: COUNTY_A,
      year: 2021,
      sector: 'Resíduos',
      category: 'Aterro',
      product: 'RSU',
      value: 5,
    },
    {
      county: COUNTY_A,
      year: 2022,
      sector: 'Energia',
      category: 'Combustão',
      product: 'Diesel',
      value: 2,
    },
  ]);
}

describe('County catalog API', () => {
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

    await seedCountyFixtures();
  });

  it('rejects unauthenticated county requests', async () => {
    const list = await request(app).get('/api/counties');
    expect(list.status).toBe(401);
    expect(list.body.code).toBe('NO_TOKEN');
  });

  it('allows unprivileged users to list and get counties with status', async () => {
    const list = await request(app)
      .get('/api/counties?sort=name&order=asc')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items[0].name).toBe('Abadia de Goiás');
    expect(list.body.items[0].status).toBeUndefined();
    expect(list.body.items[0].biome).toEqual(expect.objectContaining({ code: 'CER' }));

    const detail = await request(app)
      .get(`/api/counties/${COUNTY_A}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.status.hidroRisk).toEqual(
      expect.arrayContaining([expect.objectContaining({ year: 2015, value: 0.19 })])
    );
    expect(detail.body.status.disasterRate).toHaveLength(1);
    expect(detail.body.emissions).toBeUndefined();
  });

  it('returns 404 for an unknown county', async () => {
    const res = await request(app)
      .get(`/api/counties/${UNKNOWN_ID}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('paginates and filters county emissions', async () => {
    const page = await request(app)
      .get(`/api/counties/${COUNTY_A}/emissions?page=1&limit=2&sort=year&order=desc`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page.status).toBe(200);
    expect(page.body.items).toHaveLength(2);
    expect(page.body.pagination).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
        hasNext: true,
      })
    );

    const filtered = await request(app)
      .get(`/api/counties/${COUNTY_A}/emissions?year=2022&sector=Agro`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].product).toBe('Arroz');
  });

  it('filters counties by biome', async () => {
    const res = await request(app)
      .get(`/api/counties?biomeId=${BIOME_CER}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]._id).toBe(String(COUNTY_A));
  });

  it('filters counties by microregion', async () => {
    const res = await request(app)
      .get(`/api/counties?microregionId=${MICRO_GO}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]._id).toBe(String(COUNTY_A));
    expect(res.body.items[0].microregion).toEqual(expect.objectContaining({ name: 'Goiânia' }));
  });
});
