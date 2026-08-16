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
const { Region, State, County, GeoIndicator, GeoDisaster, GeoAmendment, GeoSyncState } = require('../api/models/geo');
const { clearMalhasCache } = require('../api/controllers/malhasController');
const { queryActionLogs } = require('../api/services/actionLogService');
const { recoverStaleSyncStates, expireRunningSync } = require('../api/services/geoSyncService');
const { matchWantedTypes } = require('../api/services/tesouroTransfersService');
const { mapRevenueSeries } = require('../api/services/siconfiService');
const { buildValuesUrl, normalizeClassificacao } = require('../api/services/ibgeAgregados');
const zlib = require('zlib');
const { parseCsv, tableToDocs, extrasFromCsvText, attachDocumentInfo, bufferToCsv } = require('../api/services/emendasService');

const REGION_CO = new mongoose.Types.ObjectId();
const STATE_GO = new mongoose.Types.ObjectId();
const COUNTY_AB = new mongoose.Types.ObjectId();

const PERIODS_BY_TABLE = {
  5938: ['2019', '2020', '2021', '2022', '2023', '2024'],
  5457: ['2020', '2021', '2022', '2023', '2024'],
  3939: ['2020', '2021', '2022', '2023', '2024'],
  9509: ['2022', '2023', '2024'],
  1849: ['2019', '2020', '2021', '2022', '2023'],
  8536: ['2020'],
};

function jsonResponse(body, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    url: '',
    headers: { get: () => null },
    text: async () => text,
    arrayBuffer: async () => Buffer.from(text),
  };
}

function textResponse(text, { status = 200, contentType = 'text/plain', lastModified } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: '',
    headers: {
      get: (name) => {
        if (String(name).toLowerCase() === 'last-modified') return lastModified || null;
        if (String(name).toLowerCase() === 'content-type') return contentType;
        return null;
      },
    },
    text: async () => text,
    arrayBuffer: async () => Buffer.from(text),
  };
}

function sidraValues(variableIds, year = '2023') {
  const ids = variableIds.length ? variableIds : ['37'];
  return ids.map((id) => ({
    id: String(id),
    unidade: 'Mil Reais',
    resultados: [
      {
        classificacoes: [{ id: '782', categoria: { 0: 'Total' } }],
        series: [
          {
            localidade: { id: '5', nivel: { id: 'N2' }, nome: 'Centro-Oeste' },
            serie: { [year]: '30' },
          },
          {
            localidade: { id: '52', nivel: { id: 'N3' }, nome: 'Goiás' },
            serie: { [year]: '20' },
          },
          {
            localidade: { id: '5200050', nivel: { id: 'N6' }, nome: 'Abadia de Goiás' },
            serie: { [year]: '10' },
          },
        ],
      },
    ],
  }));
}

function sidraMunicValues(variableIds, year = '2020') {
  const ids = variableIds.length ? variableIds : ['12443'];
  const disasterYears = [
    ['50868', '2017', '1'],
    ['50869', '2018', '0'],
    ['50870', '2019', '0'],
    ['50871', '2020', '2'],
  ];
  return ids.map((id) => ({
    id: String(id),
    unidade: 'Unidades',
    resultados: disasterYears.map(([categoryId, label, value]) => ({
      classificacoes: [
        { id: '12446', categoria: { 47692: 'Total' } },
        { id: '1210', categoria: { [categoryId]: label } },
      ],
      series: [
        {
          localidade: { id: '5', nivel: { id: 'N2' }, nome: 'Centro-Oeste' },
          serie: { [year]: value },
        },
        {
          localidade: { id: '52', nivel: { id: 'N3' }, nome: 'Goiás' },
          serie: { [year]: value },
        },
        {
          localidade: { id: '5200050', nivel: { id: 'N6' }, nome: 'Abadia de Goiás' },
          serie: { [year]: value },
        },
      ],
    })),
  }));
}

function mockExternalApis({ pibFim = '2023' } = {}) {
  return jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
    const href = String(url);
    const tableMatch = href.match(/agregados\/(\d+)/);
    const tableId = tableMatch ? tableMatch[1] : '';
    const periods = PERIODS_BY_TABLE[tableId] || ['2023'];
    const fim = tableId === '5938' ? pibFim : periods[periods.length - 1];

    if (href.includes('/metadados')) {
      return jsonResponse({
        id: Number(tableId),
        periodicidade: { frequencia: 'anual', inicio: periods[0], fim },
        nivelTerritorial: { Administrativo: ['N1', 'N2', 'N3', 'N6'] },
      });
    }
    if (href.includes('/periodos') && !href.includes('/variaveis')) {
      const list = tableId === '5938' ? periods.filter((year) => year <= pibFim) : periods;
      return jsonResponse(list.map((id) => ({ id })));
    }
    if (href.includes('/variaveis/')) {
      const varsPart = decodeURIComponent(href.split('/variaveis/')[1] || '').split('?')[0];
      const variableIds = varsPart.split('|').filter(Boolean);
      const yearMatch = href.match(/periodos\/([^/]+)/);
      const year = String(yearMatch ? yearMatch[1].split('|').pop() : fim);
      if (tableId === '8536') {
        return jsonResponse(sidraMunicValues(variableIds, year));
      }
      return jsonResponse(sidraValues(variableIds, year));
    }
    if (href.includes('package_show')) {
      return jsonResponse({
        result: {
          metadata_modified: '2024-01-15T00:00:00Z',
          resources: [
            {
              id: 'csv-1',
              format: 'CSV',
              last_modified: '2024-01-15T00:00:00Z',
              url: 'https://dadosabertos.mdr.gov.br/s2id.csv',
            },
          ],
        },
      });
    }
    if (href.includes('s2id.csv')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          'CodIBGE,Data,Cobrade,Descricao,Situacao,Protocolo\n5200050,15/01/2024,1.3.2,Inundacao,Emergencia,P-1\n',
      };
    }
    if (href.includes('/malhas/')) {
      return jsonResponse({ type: 'FeatureCollection', features: [] });
    }
    if (href.includes('ords/siconfi/tt/dca')) {
      const yearMatch = href.match(/an_exercicio=(\d{4})/);
      const year = Number(yearMatch ? yearMatch[1] : 2023);
      const anexo = decodeURIComponent((href.match(/no_anexo=([^&]+)/) || [])[1] || '');
      const idEnte = decodeURIComponent((href.match(/[?&]id_ente=([^&]+)/) || [])[1] || '');
      const isExpense = /I-D/i.test(anexo);
      const items = isExpense
        ? [
            {
              cod_ibge: '5200050',
              exercicio: year,
              coluna: 'Despesas Empenhadas',
              cod_conta: '3.0.0.0.00.00.00',
              conta: 'Total das Despesas',
              valor: 40,
            },
            {
              cod_ibge: '5200050',
              exercicio: year,
              coluna: 'Despesas Pagas',
              cod_conta: '3.0.0.0.00.00.00',
              conta: 'Total das Despesas',
              valor: 35,
            },
            {
              cod_ibge: '5200050',
              exercicio: year,
              coluna: 'Despesas Empenhadas',
              cod_conta: '3.1.00.00.00',
              conta: 'Pessoal e Encargos Sociais',
              valor: 12,
            },
            {
              cod_ibge: '52',
              exercicio: year,
              coluna: 'Despesas Empenhadas',
              cod_conta: '3.0.0.0.00.00.00',
              conta: 'Total das Despesas',
              valor: 80,
            },
          ]
        : [
            {
              cod_ibge: '5200050',
              exercicio: year,
              coluna: 'Receitas Realizadas',
              cod_conta: '1.0.0.0.00.00.00',
              conta: 'Total das Receitas',
              valor: 50,
            },
            {
              cod_ibge: '5200050',
              exercicio: year,
              coluna: 'Receitas Realizadas',
              cod_conta: '1.7.0.0.00.00.00',
              conta: 'Transferencias Correntes',
              valor: 20,
            },
            {
              cod_ibge: '52',
              exercicio: year,
              coluna: 'Receitas Realizadas',
              cod_conta: '1.0.0.0.00.00.00',
              conta: 'Total das Receitas',
              valor: 90,
            },
          ];
      const filtered = idEnte ? items.filter((row) => String(row.cod_ibge) === idEnte) : items;
      return jsonResponse({ items: filtered, hasMore: false });
    }
    if (href.includes('transferencias_constitucionais/custom/transferencias')) {
      return jsonResponse({
        registros: [
          { codigo: 3, transferencia: 'FPM' },
          { codigo: 7, transferencia: 'FPE' },
          { codigo: 10, transferencia: 'FUNDEB' },
          { codigo: 4, transferencia: 'ITR' },
        ],
      });
    }
    if (href.includes('transferencias_constitucionais/custom/por_estados')) {
      const yearMatch = href.match(/p_ano=(\d{4})/);
      const year = Number(yearMatch ? yearMatch[1] : 2023);
      return jsonResponse({ registros: [{ uf: 'GO', ano: String(year), valor: 200, mes: '01' }] });
    }
    if (href.includes('transferencias_constitucionais/custom/por_estado_municipio')) {
      const yearMatch = href.match(/p_ano=(\d{4})/);
      const year = Number(yearMatch ? yearMatch[1] : 2023);
      return jsonResponse({
        registros: [{ CO_IBGE: 5200050, ANO: String(year), VALOR: 100, MES: '01', UF: 'GO' }],
      });
    }
    if (href.includes('transferencias_constitucionais/custom/estados')) {
      return jsonResponse({ registros: [{ codigo: 9, nome: 'Goiás' }] });
    }
    if (href.includes('transferencias_constitucionais/custom/por_municipio')) {
      const yearMatch = href.match(/p_ano=(\d{4})/);
      const year = Number(yearMatch ? yearMatch[1] : 2023);
      return jsonResponse({ items: [{ co_ibge: '5200050', ano: year, valor: 100 }] });
    }
    if (href.includes('emendas-parlamentares-documentos')) {
      return textResponse(
        'Codigo da Emenda;Ano da Emenda;Favorecido;Codigo favorecido;Tipo Favorecido;Funcao;SubFuncao;Grupo Despesa;Elemento Despesa;Acao\n20240001;2024;Hospital Municipal;123;Pessoa Juridica;Saude;Atencao Basica;Pessoal e Encargos Sociais;Diarias - Pessoal Civil;Atencao basica\n',
        { contentType: 'text/csv', lastModified: 'Mon, 15 Jan 2024 00:00:00 GMT' }
      );
    }
    if (href.includes('emendas-parlamentares')) {
      if (/emendas-parlamentares\/\d{8}/.test(href)) {
        return textResponse(
          'Codigo da Emenda;Ano;Autor;Tipo de Emenda;Funcao;Codigo IBGE;UF;Valor Empenhado;Valor Pago;Favorecido\n20240001;2024;Fulano;Individual;Saude;5200050;GO;10000;8000;Prefeitura\n',
          { contentType: 'text/csv', lastModified: 'Mon, 15 Jan 2024 00:00:00 GMT' }
        );
      }
      return textResponse(
        '<html><script>var arquivos = []; var url = "download-de-dados/emendas-parlamentares/";</script></html>',
        { contentType: 'text/html' }
      );
    }
    return jsonResponse({ error: 'unmocked' }, 404);
  });
}

async function seedCatalog() {
  await Region.create({ _id: REGION_CO, code: 'CO', name: 'Centro-Oeste', isDeleted: false });
  await State.create({ _id: STATE_GO, code: 'GO', name: 'Goiás', region: REGION_CO, isDeleted: false });
  await County.create({
    _id: COUNTY_AB,
    name: 'Abadia de Goiás',
    IBGECode: '5200050',
    state: STATE_GO,
    region: REGION_CO,
    isDeleted: false,
  });
}

async function login(app, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function waitForGeoSync(app, token, source) {
  const deadline = Date.now() + 15000;
  let last;
  while (Date.now() < deadline) {
    const res = await request(app)
      .get('/api/geo/sync/status?probe=0')
      .set('Authorization', `Bearer ${token}`);
    last = (res.body.items || []).find((item) => item.source === source);
    if (last && last.status && last.status !== 'syncing') return last;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${source} sync (last=${JSON.stringify(last)})`);
}

async function startGeoSync(app, token, body) {
  const res = await request(app)
    .post('/api/geo/sync')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  expect(res.status).toBe(202);
  expect(res.body.accepted).toBe(true);
  expect(res.body.status).toBe('syncing');
  return waitForGeoSync(app, token, body.source);
}

describe('Geography indicator sync API', () => {
  let app;
  let adminToken;
  let viewerToken;
  let fetchMock;

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
    fetchMock = mockExternalApis();

    await seedAdminUser({
      username: 'admin',
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });
    adminToken = await login(app, 'admin@example.com', 'AdminPassword123!');
    const viewer = await seedUnprivilegedUser();
    viewerToken = await login(app, viewer.user.email, viewer.password);
    await seedCatalog();
  });

  afterEach(async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const running = await GeoSyncState.countDocuments({ status: 'syncing' });
      if (!running) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    fetchMock.mockRestore();
    clearMalhasCache();
  });

  it('forbids unprivileged users from sync status and sync', async () => {
    const status = await request(app)
      .get('/api/geo/sync/status')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(status.status).toBe(403);

    const sync = await request(app)
      .post('/api/geo/sync')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ source: 'pib' });
    expect(sync.status).toBe(403);
  });

  it('rejects an unknown source', async () => {
    const res = await request(app)
      .post('/api/geo/sync')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ source: 'nope' });
    expect(res.status).toBe(400);
  });

  it('accepts sync in the background and rejects a second start for the same source', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const inner = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/5938/metadados')) await gate;
      return inner(url);
    });

    try {
      const first = await request(app)
        .post('/api/geo/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ source: 'pib' });
      expect(first.status).toBe(202);
      expect(first.body.accepted).toBe(true);

      const status = await request(app)
        .get('/api/geo/sync/status?probe=0')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(status.body.items.find((item) => item.source === 'pib').status).toBe('syncing');

      const second = await request(app)
        .post('/api/geo/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ source: 'pib' });
      expect(second.status).toBe(409);
    } finally {
      release();
    }

    const done = await waitForGeoSync(app, adminToken, 'pib');
    expect(done.status).not.toBe('failed');
  });

  it('lets an admin sync PIB, skip when origin is unchanged, and fetch when the period increases', async () => {
    const first = await startGeoSync(app, adminToken, { source: 'pib' });
    expect(first.status).not.toBe('failed');
    expect(first.originPeriod).toBe('2023');

    const stored = await GeoIndicator.find({ source: 'pib', kind: 'county' }).lean();
    expect(stored.length).toBeGreaterThan(0);
    expect(stored[0].subjectId.toString()).toBe(String(COUNTY_AB));
    const valueUrls = fetchMock.mock.calls
      .map((call) => decodeURIComponent(String(call[0])))
      .filter((href) => href.includes('/variaveis/'));
    expect(valueUrls.some((href) => href.includes('N6[N3[52]]'))).toBe(true);
    expect(valueUrls.some((href) => href.includes('N6[all]'))).toBe(false);

    const valuesBefore = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/variaveis/')).length;

    const skipped = await startGeoSync(app, adminToken, { source: 'pib' });
    expect(skipped.status).toBe('up_to_date');

    const valuesAfterSkip = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/variaveis/')).length;
    expect(valuesAfterSkip).toBe(valuesBefore);

    const forced = await startGeoSync(app, adminToken, { source: 'pib', force: true });
    expect(forced.status).not.toBe('failed');
    expect(forced.status).not.toBe('up_to_date');

    fetchMock.mockRestore();
    fetchMock = mockExternalApis({ pibFim: '2024' });

    const newer = await startGeoSync(app, adminToken, { source: 'pib' });
    expect(newer.status).not.toBe('failed');
    expect(newer.originPeriod).toBe('2024');
  });

  it('re-fetches PIB when some catalog counties have no rows even if origin period is unchanged', async () => {
    await County.create({
      name: 'Abadiânia',
      IBGECode: '5200100',
      state: STATE_GO,
      region: REGION_CO,
      isDeleted: false,
    });

    const first = await startGeoSync(app, adminToken, { source: 'pib' });
    expect(first.status).not.toBe('failed');
    expect(await GeoIndicator.distinct('ibgeId', { source: 'pib', kind: 'county' })).toEqual(['5200050']);

    const backfill = await startGeoSync(app, adminToken, { source: 'pib' });
    expect(backfill.status).not.toBe('failed');
  });

  it('re-fetches PIB when county rows are missing even if origin period is unchanged', async () => {
    const first = await startGeoSync(app, adminToken, { source: 'pib' });
    expect(first.status).not.toBe('failed');

    await GeoIndicator.deleteMany({ source: 'pib', kind: 'county' });

    const backfill = await startGeoSync(app, adminToken, { source: 'pib' });
    expect(backfill.status).not.toBe('failed');
    expect(await GeoIndicator.countDocuments({ source: 'pib', kind: 'county' })).toBeGreaterThan(0);
  });

  it('syncs PAM, PPM, CEMPRE, PIA, and MUNIC independently', async () => {
    for (const source of ['pam', 'ppm', 'cempre', 'pia', 'munic']) {
      const item = await startGeoSync(app, adminToken, { source });
      expect(item.status).not.toBe('failed');
      expect(await GeoIndicator.countDocuments({ source })).toBeGreaterThan(0);
    }
  });

  it('collapses MUNIC disaster-year splits into one row per series', async () => {
    const item = await startGeoSync(app, adminToken, { source: 'munic' });
    expect(item.status).not.toBe('failed');

    const countyFlood = await GeoIndicator.find({
      source: 'munic',
      kind: 'county',
      series: 'flood',
    }).lean();
    expect(countyFlood).toHaveLength(1);
    expect(countyFlood[0].value).toBe(3);
    expect(countyFlood[0].categoryId).toBe('47692');

    const disasters = await GeoDisaster.find({ ibgeId: '5200050' }).sort({ occurredAt: 1, typeLabel: 1 }).lean();
    expect(disasters.length).toBeGreaterThan(0);
    expect(disasters.every((row) => String(row.sourceId).startsWith('munic:'))).toBe(true);
    expect(disasters.some((row) => row.typeLabel.includes('Flood') && row.occurredAt.getUTCFullYear() === 2017)).toBe(
      true
    );
  });

  it('records a clear S2ID failure when the open-data portal returns a WAF page', async () => {
    fetchMock.mockRestore();
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        '<html><head><title>Request Rejected</title></head><body>The requested URL was rejected.</body></html>',
    }));

    const item = await startGeoSync(app, adminToken, { source: 's2id' });
    expect(item.status).toBe('failed');
    expect(item.lastError).toMatch(/blocked/i);
    expect(await GeoDisaster.countDocuments()).toBe(0);
  });

  it('surfaces IBGE probe failures instead of a generic INTERNAL error', async () => {
    fetchMock.mockRestore();
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/8536/metadados')) {
        throw Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('Connect Timeout Error'), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
        });
      }
      return jsonResponse({ error: 'unmocked' }, 404);
    });

    const item = await startGeoSync(app, adminToken, { source: 'munic' });
    expect(item.status).toBe('failed');
    expect(item.lastError).toMatch(/\[fetch\].*unreachable|IBGE agregados service is unreachable/);
  });

  it('records full error output on geo.sync logs when DEBUG is on', async () => {
    const previous = process.env.DEBUG;
    process.env.DEBUG = 'true';
    fetchMock.mockRestore();
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/8536/metadados')) {
        throw Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('Connect Timeout Error'), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
        });
      }
      return jsonResponse({ error: 'unmocked' }, 404);
    });

    try {
      const item = await startGeoSync(app, adminToken, { source: 'munic' });
      expect(item.status).toBe('failed');
      expect(item.lastError).toMatch(/\[fetch\]/);

      const { items } = await queryActionLogs({ action: 'geo.sync', resourceId: 'munic', limit: 20 });
      const failLog = items.find((log) => log.success === false);
      expect(failLog).toBeTruthy();
      expect(failLog.meta.failedStage).toBe('fetch');
      expect(failLog.meta.stageErrors).toEqual(
        expect.arrayContaining([expect.objectContaining({ stage: 'fetch' })])
      );
      expect(failLog.meta.debugError).toMatch(/IBGE agregados service is unreachable/);
      expect(failLog.meta.debugError).toMatch(/Connect Timeout Error|fetch failed/);
    } finally {
      if (previous == null) delete process.env.DEBUG;
      else process.env.DEBUG = previous;
    }
  });

  it('syncs S2ID disasters when CKAN last_modified is new and skips afterwards', async () => {
    const first = await startGeoSync(app, adminToken, { source: 's2id' });
    expect(first.status).not.toBe('failed');

    const events = await GeoDisaster.find().lean();
    expect(events).toHaveLength(1);
    expect(events[0].ibgeId).toBe('5200050');
    expect(events[0].county.toString()).toBe(String(COUNTY_AB));
    expect(events[0].recognition).toBe('emergency');

    const skipped = await startGeoSync(app, adminToken, { source: 's2id' });
    expect(skipped.status).toBe('up_to_date');
  });

  it('lets any verified session read indicators and disasters', async () => {
    await startGeoSync(app, adminToken, { source: 'pib' });
    await startGeoSync(app, adminToken, { source: 's2id' });

    const indicators = await request(app)
      .get(`/api/geo/indicators?kind=county&id=${COUNTY_AB}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(indicators.status).toBe(200);
    expect(indicators.body.items.length).toBeGreaterThan(0);

    const disasters = await request(app)
      .get(`/api/geo/disasters?countyId=${COUNTY_AB}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(disasters.status).toBe(200);
    expect(disasters.body.items).toHaveLength(1);
  });

  it('lists per-source status for admins', async () => {
    const res = await request(app)
      .get('/api/geo/sync/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((item) => item.source);
    expect(ids).toEqual([
      'malhas',
      'pib',
      'pam',
      'ppm',
      'cempre',
      'pia',
      'munic',
      's2id',
      'siconfi',
      'transfers',
      'emendas',
    ]);
  });

  it('syncs SICONFI accounts onto county and region totals', async () => {
    const item = await startGeoSync(app, adminToken, { source: 'siconfi' });
    expect(item.status).not.toBe('failed');

    const county = await GeoIndicator.find({ source: 'siconfi', kind: 'county', series: 'revenue_total' }).lean();
    expect(county.length).toBeGreaterThan(0);
    expect(county[0].subjectId.toString()).toBe(String(COUNTY_AB));
    expect(county[0].value).toBe(50);

    const region = await GeoIndicator.find({
      source: 'siconfi',
      kind: 'region',
      series: 'revenue_total',
      ibgeId: '5',
    }).lean();
    expect(region.length).toBeGreaterThan(0);
    expect(region.every((row) => row.value === 50)).toBe(true);

    const skipped = await startGeoSync(app, adminToken, { source: 'siconfi' });
    expect(skipped.status).toBe('up_to_date');
  });

  it('syncs Tesouro constitutional transfers for FPM and FPE', async () => {
    const item = await startGeoSync(app, adminToken, { source: 'transfers' });
    expect(item.status).not.toBe('failed');

    const fpm = await GeoIndicator.find({ source: 'transfers', kind: 'county', series: 'fpm' }).lean();
    expect(fpm.length).toBeGreaterThan(0);
    expect(fpm[0].value).toBe(100);

    const fpe = await GeoIndicator.find({ source: 'transfers', kind: 'state', series: 'fpe' }).lean();
    expect(fpe.length).toBeGreaterThan(0);
    expect(fpe[0].value).toBe(200);

    const skipped = await startGeoSync(app, adminToken, { source: 'transfers' });
    expect(skipped.status).toBe('up_to_date');
  });

  it('matches Tesouro transfer types from the live registros catalog', () => {
    const matched = matchWantedTypes([
      { codigo: 3, transferencia: 'FPM' },
      { codigo: 7, transferencia: 'FPE' },
      { codigo: 10, transferencia: 'FUNDEB' },
      { codigo: 4, transferencia: 'ITR' },
    ]);
    expect(matched.map((item) => item.id)).toEqual(['fpm', 'fpe', 'fundeb', 'itr']);
    expect(matched.map((item) => item.codigo)).toEqual(['3', '7', '10', '4']);
  });

  it('converts SIDRA category pipes to commas so IBGE does not 500', () => {
    expect(normalizeClassificacao('79[2670|32794|32796|2677]')).toBe('79[2670,32794,32796,2677]');
    expect(normalizeClassificacao('12446[47692]|1210[50868,50869]')).toBe(
      '12446[47692]|1210[50868,50869]'
    );
    const url = buildValuesUrl({
      aggregateId: 3939,
      periods: ['2020'],
      variables: ['105'],
      localidades: 'N2[all]',
      classificacao: '79[2670|32794]',
    });
    expect(decodeURIComponent(url)).toContain('classificacao=79[2670,32794]');
  });

  it('maps SICONFI Receitas Brutas Realizadas totals', () => {
    expect(
      mapRevenueSeries({
        coluna: 'Receitas Brutas Realizadas',
        conta: 'RECEITAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)',
        cod_conta: 'ReceitasExcetoIntraOrcamentarias',
      })
    ).toBe('revenue_total');
  });

  it('syncs emenda events and lets a verified session read them', async () => {
    const item = await startGeoSync(app, adminToken, { source: 'emendas' });
    expect(item.status).not.toBe('failed');

    const events = await GeoAmendment.find().lean();
    expect(events).toHaveLength(1);
    expect(events[0].ibgeId).toBe('5200050');
    expect(events[0].author).toBe('Fulano');
    expect(events[0].amendmentType).toBe('individual');
    expect(events[0].committed).toBe(10000);
    expect(events[0].paid).toBe(8000);
    expect(events[0].function).toBe('Saude');
    expect(events[0].subfunction).toBe('Atencao Basica');
    expect(events[0].grupo).toBe('Pessoal e Encargos Sociais');
    expect(events[0].purpose).toBe('Diarias - Pessoal Civil');
    expect(events[0].action).toBe('Atencao basica');
    expect(events[0].target).toBe('Hospital Municipal');
    expect(events[0].targetCode).toBe('123');

    const totals = await GeoIndicator.find({ source: 'emendas', kind: 'county' }).lean();
    expect(totals.length).toBeGreaterThan(0);

    const listed = await request(app)
      .get(`/api/geo/amendments?kind=county&id=${COUNTY_AB}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);

    const skipped = await startGeoSync(app, adminToken, { source: 'emendas' });
    expect(skipped.status).toBe('up_to_date');
  });

  it('maps live emendas columns onto function, purpose, and target', () => {
    const csv = [
      '"Código da Emenda";"Ano da Emenda";"Tipo de Emenda";"Nome do Autor da Emenda";"Código Município IBGE";"UF";"Função";"SubFunção";"Grupo Despesa";"Elemento Despesa";"Ação";"Favorecido";"Valor Empenhado";"Valor Pago"',
      '"202612340001";"2026";"Emenda Individual - Transferências Especiais";"VINICIUS CARVALHO";"5200050";"GO";"";"";"";"";"";"";"2000000,00";"0,00"',
      '"202443960013";"2024";"Emenda Individual - Transferências com Finalidade Definida";"IZA ARRUDA";"5200050";"GO";"Saúde";"Atenção Básica";"Outras Despesas Correntes";"Material de Consumo";"Estruturação de Unidades de Saúde";"Hospital Municipal";"10000,00";"8000,00"',
    ].join('\n');
    const maps = {
      countyByIbge: new Map([['5200050', { _id: COUNTY_AB, state: STATE_GO, region: REGION_CO }]]),
      stateByIbge: new Map([['52', { _id: STATE_GO, region: REGION_CO }]]),
      stateByObjectId: new Map(),
      regionByObjectId: new Map(),
    };
    const { amendments } = tableToDocs(parseCsv(csv), maps, new Date(), 2020);
    const special = amendments.find((row) => row.code === '202612340001');
    const defined = amendments.find((row) => row.code === '202443960013');
    expect(special.function).toBe('');
    expect(special.purpose).toBe('');
    expect(special.action).toBe('');
    expect(special.target).toBe('');
    expect(defined.function).toBe('Saúde');
    expect(defined.subfunction).toBe('Atenção Básica');
    expect(defined.grupo).toBe('Outras Despesas Correntes');
    expect(defined.purpose).toBe('Material de Consumo');
    expect(defined.action).toBe('Estruturação de Unidades de Saúde');
    expect(defined.target).toBe('Hospital Municipal');
  });

  it('keeps emendas with placeholder IBGE codes by falling back to UF', () => {
    const csv = [
      '"Código da Emenda";"Ano da Emenda";"Tipo de Emenda";"Nome do Autor da Emenda";"Código IBGE";"Código Município IBGE";"UF";"Município";"Localidade de aplicação do recurso";"Valor Empenhado";"Valor Pago"',
      '"202612340001";"2026";"Emenda Individual";"AUTOR A";"-1";"-1";"GO";"Abadia de Goiás";"Abadia de Goiás / GO";"10000,00";"8000,00"',
      '"202612340002";"2026";"Emenda Individual";"AUTOR B";"-1";"";;"";"Goiânia / GO";"5000,00";"0,00"',
      '"202612340003";"2026";"Emenda Individual";"AUTOR C";"-1";"9999999";"ZZ";"";"";"1000,00";"0,00"',
      '"202612340004";"2026";"Emenda Individual";"AUTOR D";"";"";"";"";"";"1000,00";"0,00"',
    ].join('\n');
    const maps = {
      countyByIbge: new Map([['5200050', { _id: COUNTY_AB, state: STATE_GO, region: REGION_CO }]]),
      stateByIbge: new Map([['52', { _id: STATE_GO, region: REGION_CO }]]),
      stateByObjectId: new Map(),
      regionByObjectId: new Map(),
    };
    const { amendments, failed } = tableToDocs(parseCsv(csv), maps, new Date(), 2020);
    expect(amendments).toHaveLength(2);
    expect(amendments.every((row) => row.kind === 'state' && row.ibgeId === '52')).toBe(true);
    expect(failed).toBe(1);
  });

  it('reads the main emendas CSV from a multi-file zip and accepts UF names', () => {
    const main = [
      '"Código da Emenda";"Ano da Emenda";"Nome do Autor da Emenda";"Código Município IBGE";"UF";"Nome Função";"Nome Subfunção";"Nome Ação";"Valor Empenhado";"Valor Pago"',
      '"202612340001";"2026";"VINICIUS CARVALHO";"5200050";"GOIÁS";"Saúde";"Atenção Básica";"Estruturação";"980000,00";"0,00"',
    ].join('\n');
    const favorecido = [
      '"Código da Emenda";"Ano/Mês";"Favorecido";"UF Favorecido"',
      '"202612340001";"202607";"Hospital Municipal";"GO"',
    ].join('\n');
    const zip = Buffer.concat(
      [
        { name: 'EmendasParlamentares.csv', text: main },
        { name: 'EmendasParlamentares_PorFavorecido.csv', text: favorecido },
      ].map(({ name, text }) => {
        const data = Buffer.from(text, 'utf8');
        const compressed = zlib.deflateRawSync(data);
        const nameBuf = Buffer.from(name);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(8, 8);
        header.writeUInt32LE(compressed.length, 18);
        header.writeUInt32LE(data.length, 22);
        header.writeUInt16LE(nameBuf.length, 26);
        return Buffer.concat([header, nameBuf, compressed]);
      })
    );
    const maps = {
      countyByIbge: new Map([['5200050', { _id: COUNTY_AB, state: STATE_GO, region: REGION_CO }]]),
      stateByIbge: new Map([['52', { _id: STATE_GO, region: REGION_CO }]]),
      stateByObjectId: new Map(),
      regionByObjectId: new Map(),
    };
    const csv = bufferToCsv(zip);
    expect(csv).toContain('VINICIUS CARVALHO');
    expect(csv).not.toContain('Hospital Municipal');
    const { amendments, failed } = tableToDocs(parseCsv(csv), maps, new Date(), 2020);
    expect(failed).toBe(0);
    expect(amendments).toHaveLength(1);
    expect(amendments[0].function).toBe('Saúde');
    expect(amendments[0].subfunction).toBe('Atenção Básica');
    expect(amendments[0].action).toBe('Estruturação');
    const merged = attachDocumentInfo(amendments[0] ? { amendments, indicators: [] } : { amendments: [] }, extrasFromCsvText(favorecido, 2020, new Set(['202612340001'])));
    expect(merged.amendments[0].target).toBe('Hospital Municipal');
  });

  it('decodes latin1 emendas csv when author names contain Ã', () => {
    const csv = [
      '"Código da Emenda";"Ano da Emenda";"Nome do Autor da Emenda";"Código Município IBGE";"UF";"Nome Função";"Nome Subfunção";"Nome Ação";"Valor Empenhado";"Valor Pago"',
      '"202612340001";"2026";"JOÃO SILVA";"5200050";"GOIÁS";"Saúde";"Atenção Básica";"Estruturação";"980000,00";"0,00"',
    ].join('\n');
    const maps = {
      countyByIbge: new Map([['5200050', { _id: COUNTY_AB, state: STATE_GO, region: REGION_CO }]]),
      stateByIbge: new Map([['52', { _id: STATE_GO, region: REGION_CO }]]),
      stateByObjectId: new Map(),
      regionByObjectId: new Map(),
    };
    const text = bufferToCsv(Buffer.from(csv, 'latin1'));
    expect(text).toContain('Código Município IBGE');
    const { amendments, failed } = tableToDocs(parseCsv(text), maps, new Date(), 2020);
    expect(failed).toBe(0);
    expect(amendments).toHaveLength(1);
    expect(amendments[0].function).toBe('Saúde');
    expect(amendments[0].subfunction).toBe('Atenção Básica');
    expect(amendments[0].action).toBe('Estruturação');
    expect(amendments[0].author).toBe('JOÃO SILVA');
  });

  it('fills emenda function, purpose, and target from the documentos file', () => {
    const maps = {
      countyByIbge: new Map([
        ['5200050', { _id: COUNTY_AB, name: 'Abadia de Goiás', state: STATE_GO, region: REGION_CO }],
      ]),
      stateByIbge: new Map([['52', { _id: STATE_GO, name: 'Goiás', region: REGION_CO }]]),
      stateByObjectId: new Map(),
      regionByObjectId: new Map(),
    };
    const main = [
      '"Código da Emenda";"Ano da Emenda";"Tipo de Emenda";"Nome do Autor da Emenda";"Código Município IBGE";"UF";"Função";"Ação";"Valor Empenhado";"Valor Pago"',
      '"202612340001";"2026";"Emenda Individual - Transferências Especiais";"VINICIUS CARVALHO";"5200050";"GO";"";"";"980000,00";"0,00"',
    ].join('\n');
    const docs = [
      'Planilha de documentos de despesa',
      '"Código Emenda";"Ano da Emenda";"Favorecido";"Codigo favorecido";"Tipo Favorecido";"Função";"SubFunção";"Grupo Despesa";"Elemento Despesa";"Ação"',
      '"12340001";"2026";"";"";"";"Saúde";"";"";"";""',
      '"202612340001";"2026";"Hospital Municipal";"123";"Pessoa Juridica";"Saúde";"Atenção Básica";"Outras Despesas Correntes";"Material de Consumo";"Estruturação de Unidades de Saúde"',
    ].join('\n');
    const parsed = tableToDocs(parseCsv(main), maps, new Date(), 2020);
    expect(parsed.amendments[0].function).toBe('');
    expect(parsed.amendments[0].target).toBe('');
    const extras = extrasFromCsvText(docs, 2020, new Set(['202612340001', '12340001']));
    const merged = attachDocumentInfo(parsed, extras);
    expect(merged.amendments[0].function).toBe('Saúde');
    expect(merged.amendments[0].subfunction).toBe('Atenção Básica');
    expect(merged.amendments[0].grupo).toBe('Outras Despesas Correntes');
    expect(merged.amendments[0].purpose).toBe('Material de Consumo');
    expect(merged.amendments[0].action).toBe('Estruturação de Unidades de Saúde');
    expect(merged.amendments[0].target).toBe('Hospital Municipal');
  });

  it('wraps malhas sync through the unified source endpoint', async () => {
    const item = await startGeoSync(app, adminToken, { source: 'malhas' });
    expect(item.status).not.toBe('failed');
    const state = await GeoSyncState.findOne({ source: 'malhas' }).lean();
    expect(state).toBeTruthy();
  });

  it('records geography sync start and result in action logs', async () => {
    const first = await startGeoSync(app, adminToken, { source: 'pib' });
    expect(first.status).not.toBe('failed');

    async function waitForGeoLogs(predicate) {
      for (let i = 0; i < 25; i += 1) {
        const { items } = await queryActionLogs({ resourceType: 'GEO', limit: 100 });
        if (predicate(items)) return items;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const { items } = await queryActionLogs({ resourceType: 'GEO', limit: 100 });
      throw new Error(`Timed out waiting for geo action logs: ${JSON.stringify(items.map((log) => ({ action: log.action, resourceId: log.resourceId, meta: log.meta })))}`);
    }

    const afterFirst = await waitForGeoLogs((items) =>
      items.some((log) => log.action === 'geo.sync_start' && log.resourceId === 'pib') &&
      items.some((log) => log.action === 'geo.sync' && log.resourceId === 'pib' && !log.meta?.skipped)
    );

    const startLog = afterFirst.find((log) => log.action === 'geo.sync_start' && log.resourceId === 'pib');
    expect(startLog).toEqual(
      expect.objectContaining({
        username: 'admin',
        statusCode: 202,
        success: true,
        resourceType: 'GEO',
      })
    );
    expect(startLog.meta).toEqual(expect.objectContaining({ source: 'pib', force: false }));

    const resultLog = afterFirst.find(
      (log) => log.action === 'geo.sync' && log.resourceId === 'pib' && !log.meta?.skipped
    );
    expect(resultLog).toEqual(
      expect.objectContaining({
        username: 'admin',
        success: true,
        statusCode: 200,
        resourceType: 'GEO',
        resourceId: 'pib',
      })
    );
    expect(resultLog.meta).toEqual(
      expect.objectContaining({
        source: 'pib',
        label: 'PIB / VAB',
        skipped: false,
        originPeriod: '2023',
      })
    );
    expect(resultLog.meta.rowCount).toBeGreaterThan(0);
    expect(resultLog.meta.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'fetch', status: 'ok' }),
        expect.objectContaining({ stage: 'database', status: 'ok' }),
        expect.objectContaining({ stage: 'save', status: 'ok' }),
      ])
    );
    expect(resultLog.meta).not.toHaveProperty('debugError');
    expect(resultLog.meta.requestCount).toBeGreaterThan(0);
    expect(resultLog.meta.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: expect.stringContaining('servicodados.ibge.gov.br/api/v3/agregados/5938'),
        }),
      ])
    );
    const valuesRequest = resultLog.meta.requests.find((item) =>
      String(item.url).includes('/variaveis/')
    );
    expect(valuesRequest?.params).toEqual(
      expect.objectContaining({
        localidades: expect.any(String),
      })
    );
    expect(resultLog.message).toMatch(/PIB \/ VAB/);
    expect(resultLog.message).toMatch(/updated|fetched/);

    const skipped = await startGeoSync(app, adminToken, { source: 'pib' });
    expect(skipped.status).toBe('up_to_date');

    const afterSkip = await waitForGeoLogs((items) =>
      items.some((log) => log.action === 'geo.sync' && log.resourceId === 'pib' && log.meta?.skipped === true)
    );
    const skipLog = afterSkip.find(
      (log) => log.action === 'geo.sync' && log.resourceId === 'pib' && log.meta?.skipped === true
    );
    expect(skipLog.message).toMatch(/skipped/i);
    expect(skipLog.meta).toEqual(
      expect.objectContaining({
        source: 'pib',
        skipped: true,
      })
    );
  });

  it('resets leftover syncing status on start and times out a running sync', async () => {
    await GeoSyncState.create({
      source: 'pib',
      status: 'syncing',
      lastSyncedAt: new Date(Date.now() - 40 * 60 * 1000),
      lastSuccessAt: new Date(),
      originPeriod: '2023',
    });
    await GeoSyncState.create({
      source: 'pam',
      status: 'syncing',
      lastSyncedAt: new Date(),
    });
    await GeoSyncState.create({
      source: 'ppm',
      status: 'updated',
      lastSuccessAt: new Date(),
      originPeriod: '2024',
    });

    const startup = await recoverStaleSyncStates({ reason: 'Sync was reset on server start.' });
    expect(startup.reset).toBe(2);
    expect(startup.sources.sort()).toEqual(['pam', 'pib']);

    const afterStart = await GeoSyncState.find({ source: { $in: ['pib', 'pam', 'ppm'] } })
      .sort({ source: 1 })
      .lean();
    expect(afterStart.find((row) => row.source === 'pam').status).toBe('idle');
    expect(afterStart.find((row) => row.source === 'pib').status).toBe('updated');
    expect(afterStart.find((row) => row.source === 'ppm').status).toBe('updated');

    const listed = await request(app)
      .get('/api/geo/sync/status?probe=0')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items.find((item) => item.source === 'pib').status).not.toBe('syncing');

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const inner = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/5938/metadados')) await gate;
      return inner(url);
    });

    try {
      const started = await request(app)
        .post('/api/geo/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ source: 'pib' });
      expect(started.status).toBe(202);

      const timedOut = await expireRunningSync('pib');
      expect(timedOut.reset).toBe(true);
      expect((await GeoSyncState.findOne({ source: 'pib' }).lean()).status).toBe('updated');

      const status = await request(app)
        .get('/api/geo/sync/status?probe=0')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(status.body.items.find((item) => item.source === 'pib').status).not.toBe('syncing');

      const again = await request(app)
        .post('/api/geo/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ source: 'pib' });
      expect(again.status).toBe(202);
    } finally {
      release();
    }
  });
});
