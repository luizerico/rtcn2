const GEO_KINDS = new Set(['regions', 'states', 'biomes', 'microregions', 'counties']);
const OBJECT_ID = /^[a-fA-F0-9]{24}$/;

const cache = new Map<string, unknown>();

export function normalizeApiEndpoint(endpoint: string): string {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return path.split('#')[0];
}

export function isGeoCatalogEndpoint(endpoint: string): boolean {
  const [pathname] = normalizeApiEndpoint(endpoint).split('?');
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0 || !GEO_KINDS.has(parts[0])) return false;
  if (parts.length === 1) return true;
  if (parts.length === 2 && OBJECT_ID.test(parts[1])) return true;
  return false;
}

export function clearGeoSessionCache() {
  cache.clear();
}

export async function getCachedGeo<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached !== undefined) return cached as T;
  const pending = loader()
    .then((value) => {
      cache.set(key, value);
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });
  cache.set(key, pending);
  return pending;
}
