import { apiGet, clearLocalSessionHints } from '@/lib/apiUtils';
import {
  clearGeoSessionCache,
  getCachedGeo,
  isGeoCatalogEndpoint,
} from '@/lib/geoSessionCache';

describe('geoSessionCache', () => {
  beforeEach(() => {
    clearGeoSessionCache();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    clearGeoSessionCache();
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

  it('caches identical geo list GETs through apiGet', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ _id: 's1', name: 'Goiás' }] }),
    });

    const first = await apiGet('/states?limit=100');
    const second = await apiGet('/states?limit=100');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('does not cache county emissions', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await apiGet('/counties/507f1f77bcf86cd799439011/emissions');
    await apiGet('/counties/507f1f77bcf86cd799439011/emissions');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('clears cached geo data on logout', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await apiGet('/regions');
    clearLocalSessionHints();
    await apiGet('/regions');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
