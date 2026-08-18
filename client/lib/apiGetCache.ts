const cache = new Map<string, unknown>();
let epoch = 0;

export function normalizeApiEndpoint(endpoint: string): string {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return path.split('#')[0];
}

function persistGet(endpoint: string): boolean {
  const [pathname] = normalizeApiEndpoint(endpoint).split('?');
  return pathname !== '/auth/me';
}

export function clearApiGetCache() {
  epoch += 1;
  cache.clear();
}

export async function getCachedGet<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const cacheKey = normalizeApiEndpoint(key);
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached as T;

  const started = epoch;
  const pending = loader()
    .then((value) => {
      if (started !== epoch) return value;
      if (persistGet(cacheKey)) cache.set(cacheKey, value);
      else cache.delete(cacheKey);
      return value;
    })
    .catch((error) => {
      if (started === epoch && cache.get(cacheKey) === pending) {
        cache.delete(cacheKey);
      }
      throw error;
    });

  cache.set(cacheKey, pending);
  return pending;
}
