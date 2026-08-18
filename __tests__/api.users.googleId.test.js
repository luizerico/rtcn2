/**
 * @jest-environment node
 */

const User = require('../api/models/User');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  clearDatabase,
} = require('./helpers/apiTestUtils');

describe('User googleId unique index', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  }, 120000);

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('allows multiple password users after dropping a unique index on googleId: null', async () => {
    await User.syncIndexes();
    try {
      await User.collection.dropIndex('googleId_1');
    } catch {
      // Index may not exist yet on a fresh memory server.
    }
    await User.collection.createIndex({ googleId: 1 }, { unique: true, name: 'googleId_1' });

    await User.collection.insertOne({
      username: 'local1',
      email: 'local1@example.com',
      password: 'hash',
      isVerified: true,
      googleId: null,
      deletedAt: null,
    });

    await expect(
      User.collection.insertOne({
        username: 'local2',
        email: 'local2@example.com',
        password: 'hash',
        isVerified: true,
        googleId: null,
        deletedAt: null,
      })
    ).rejects.toMatchObject({ code: 11000 });

    await User.migrateUserGoogleIdIndex();

    const second = await User.create({
      username: 'local2',
      email: 'local2@example.com',
      password: 'hash',
      isVerified: true,
    });
    const third = await User.create({
      username: 'local3',
      email: 'local3@example.com',
      password: 'hash',
      isVerified: true,
    });

    expect(second.username).toBe('local2');
    expect(third.username).toBe('local3');
    expect(second.googleId).toBeUndefined();
    expect(third.googleId).toBeUndefined();
  });

  it('still rejects two active users with the same googleId', async () => {
    await User.migrateUserGoogleIdIndex();

    await User.create({
      username: 'guser1',
      email: 'guser1@example.com',
      googleId: 'google-sub-1',
      isVerified: true,
    });

    await expect(
      User.create({
        username: 'guser2',
        email: 'guser2@example.com',
        googleId: 'google-sub-1',
        isVerified: true,
      })
    ).rejects.toMatchObject({ code: 11000 });
  });
});
