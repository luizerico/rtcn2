import { clearApiGetCache, getCachedGet, normalizeApiEndpoint } from '@/lib/apiGetCache';

const GEO_KINDS = new Set(['regions', 'states', 'biomes', 'microregions', 'counties']);
const OBJECT_ID = /^[a-fA-F0-9]{24}$/;

export { normalizeApiEndpoint };

export function isGeoCatalogEndpoint(endpoint: string): boolean {
  const [pathname] = normalizeApiEndpoint(endpoint).split('?');
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0 || !GEO_KINDS.has(parts[0])) return false;
  if (parts.length === 1) return true;
  if (parts.length === 2 && OBJECT_ID.test(parts[1])) return true;
  return false;
}

export function clearGeoSessionCache() {
  clearApiGetCache();
}

export async function getCachedGeo<T>(key: string, loader: () => Promise<T>): Promise<T> {
  return getCachedGet(key, loader);
}
