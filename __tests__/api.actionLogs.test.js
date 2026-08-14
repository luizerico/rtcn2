/**
 * @jest-environment node
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
  createTestApp,
  seedAdminUser,
  seedUnprivilegedUser,
} = require('./helpers/apiTestUtils');
const { recordAction, queryActionLogs } = require('../api/services/actionLogService');

async function waitForLogs(predicate, { attempts = 20, delayMs = 25 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const result = await queryActionLogs({ limit: 100, sort: 'createdAt', order: 'desc' });
    if (predicate(result.items)) {
      return result.items;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Timed out waiting for action logs.');
}

describe('Action logs API', () => {
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
  });

  it('allows admin to list logs and denies unprivileged users', async () => {
    await recordAction({
      username: 'admin',
      action: 'user.create',
      resourceType: 'USER',
      method: 'POST',
      path: '/api/users',
      statusCode: 201,
    });

    const allowed = await request(app)
      .get('/api/logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.items)).toBe(true);
    expect(allowed.body.pagination).toEqual(
      expect.objectContaining({
        page: 1,
        total: expect.any(Number),
      })
    );

    const denied = await request(app)
      .get('/api/logs')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(denied.status).toBe(403);
  });

  it('filters, searches, and orders logs in the backend', async () => {
    await recordAction({
      username: 'alice',
      action: 'auth.login',
      resourceType: 'AUTH',
      method: 'POST',
      path: '/api/auth/login',
      statusCode: 200,
      message: 'alice auth.login',
    });
    await recordAction({
      username: 'bob',
      action: 'user.create',
      resourceType: 'USER',
      method: 'POST',
      path: '/api/users',
      statusCode: 201,
      message: 'bob user.create',
    });
    await recordAction({
      username: 'alice',
      action: 'group.update',
      resourceType: 'GROUP',
      method: 'PUT',
      path: '/api/groups/abc',
      statusCode: 200,
    });

    const byUser = await request(app)
      .get('/api/logs')
      .query({ username: 'alice', sort: 'action', order: 'asc' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byUser.status).toBe(200);
    expect(byUser.body.items).toHaveLength(2);
    expect(byUser.body.items.map((item) => item.action)).toEqual(['auth.login', 'group.update']);
    expect(byUser.body.sort).toEqual({ field: 'action', order: 'asc' });

    const byResource = await request(app)
      .get('/api/logs')
      .query({ resourceType: 'USER' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byResource.status).toBe(200);
    expect(byResource.body.items).toHaveLength(1);
    expect(byResource.body.items[0].username).toBe('bob');

    const search = await request(app)
      .get('/api/logs')
      .query({ q: 'user.create' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(search.status).toBe(200);
    expect(search.body.items).toHaveLength(1);
    expect(search.body.items[0].action).toBe('user.create');
  });

  it('records mutating API actions automatically', async () => {
    const createUser = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'logged-user',
        email: 'logged@example.com',
        password: 'Password123!',
      });
    expect(createUser.status).toBe(201);

    const items = await waitForLogs((logs) =>
      logs.some((log) => log.action === 'user.create' && log.path === '/api/users')
    );

    const created = items.find((log) => log.action === 'user.create' && log.path === '/api/users');
    expect(created).toEqual(
      expect.objectContaining({
        username: 'admin',
        method: 'POST',
        statusCode: 201,
        success: true,
        resourceType: 'USER',
      })
    );
    expect(created.meta).not.toHaveProperty('password');
  });

  it('exposes filter options for the UI', async () => {
    await recordAction({
      username: 'admin',
      action: 'auth.login',
      resourceType: 'AUTH',
      method: 'POST',
      path: '/api/auth/login',
      statusCode: 200,
    });

    const res = await request(app)
      .get('/api/logs/filters')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.actions).toEqual(expect.arrayContaining(['auth.login']));
    expect(res.body.resourceTypes).toEqual(expect.arrayContaining(['AUTH']));
    expect(res.body.sortableFields).toEqual(expect.arrayContaining(['createdAt', 'username']));
  });

  it('paginates logs in the backend', async () => {
    for (let i = 0; i < 5; i += 1) {
      await recordAction({
        username: 'admin',
        action: 'user.create',
        resourceType: 'USER',
        method: 'POST',
        path: `/api/users/${i}`,
        statusCode: 201,
        message: `log-${i}`,
      });
    }

    const page1 = await request(app)
      .get('/api/logs')
      .query({ action: 'user.create', limit: 2, page: 1, sort: 'createdAt', order: 'asc' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.pagination).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 2,
        total: 5,
        totalPages: 3,
        hasPrev: false,
        hasNext: true,
      })
    );

    const page2 = await request(app)
      .get('/api/logs')
      .query({ action: 'user.create', limit: 2, page: 2, sort: 'createdAt', order: 'asc' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page2.status).toBe(200);
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.pagination).toEqual(
      expect.objectContaining({
        page: 2,
        hasPrev: true,
        hasNext: true,
      })
    );
    expect(page2.body.items[0]._id).not.toBe(page1.body.items[0]._id);

    const page3 = await request(app)
      .get('/api/logs')
      .query({ action: 'user.create', limit: 2, page: 3, sort: 'createdAt', order: 'asc' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page3.status).toBe(200);
    expect(page3.body.items).toHaveLength(1);
    expect(page3.body.pagination).toEqual(
      expect.objectContaining({
        page: 3,
        hasPrev: true,
        hasNext: false,
      })
    );

    const clamped = await request(app)
      .get('/api/logs')
      .query({ action: 'user.create', limit: 2, page: 99 })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(clamped.status).toBe(200);
    expect(clamped.body.pagination.page).toBe(3);
  });
});
