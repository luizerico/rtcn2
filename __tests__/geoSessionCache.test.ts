import { apiGet, apiPost, clearApiGetCache, clearLocalSessionHints } from '@/lib/apiUtils';
import {
  clearGeoSessionCache,
  getCachedGeo,
  isGeoCatalogEndpoint,
} from '@/lib/geoSessionCache';

function mockJson(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}

describe('apiGet cache', () => {
  beforeEach(() => {
    clearApiGetCache();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    clearApiGetCache();
    jest.restoreAllMocks();
  });

  it('identifies catalog geo GETs and skips nested routes', () => {
    expect(isGeoCatalogEndpoint('/states?limit=100&sort=name&order=asc')).toBe(true);
    expect(isGeoCatalogEndpoint('/regions')).toBe(true);
    expect(isGeoCatalogEndpoint('/counties/507f1f77bcf86cd799439011')).toBe(true);
    expect(isGeoCatalogEndpoint('/counties/507f1f77bcf86cd799439011/emissions')).toBe(false);
    expect(isGeoCatalogEndpoint('/counties/507f1f77bcf86cd799439011/instruments')).toBe(false);
    expect(isGeoCatalogEndpoint('/surveys/507f1f77bcf86cd799439011/counties')).toBe(false);
  });

  it('deduplicates in-flight and completed loaders', async () => {
    let calls = 0;
    const loader = jest.fn(async () => {
      calls += 1;
      return { items: [{ _id: 's1' }] };
    });

    const [first, second] = await Promise.all([
      getCachedGeo('/states', loader),
      getCachedGeo('/states', loader),
    ]);
    const third = await getCachedGeo('/states', loader);

    expect(calls).toBe(1);
    expect(first).toEqual(second);
    expect(third).toEqual(first);
  });

  it('caches identical list GETs through apiGet', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockJson({ items: [{ _id: 's1', name: 'Goiás' }] }));

    const first = await apiGet('/states?limit=100');
    const second = await apiGet('/states?limit=100');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('caches identical user list queries', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockJson({ items: [], pagination: { page: 1 } }));

    await apiGet('/users?page=1');
    await apiGet('/users?page=1');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('caches identical county emission queries by full URL', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockJson({ items: [] }));

    await apiGet('/counties/507f1f77bcf86cd799439011/emissions?page=1');
    await apiGet('/counties/507f1f77bcf86cd799439011/emissions?page=1');
    await apiGet('/counties/507f1f77bcf86cd799439011/emissions?page=2');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('invalidates GET cache after a mutation', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockJson({ items: [], _id: 'u1' }));

    await apiGet('/users?page=1');
    await apiPost('/users', { username: 'ada' });
    await apiGet('/users?page=1');

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not persist /auth/me so refresh can refetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockJson({ user: { _id: 'u1' }, permissions: [] })
    );

    await apiGet('/auth/me');
    await apiGet('/auth/me');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('clears cached GET data on logout', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockJson({ items: [] }));

    await apiGet('/regions');
    clearLocalSessionHints();
    await apiGet('/regions');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('clears cached geo data through the geo helper', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockJson({ items: [] }));

    await apiGet('/regions');
    clearGeoSessionCache();
    await apiGet('/regions');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
