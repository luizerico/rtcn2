import type { CatalogObject } from './types';

export function matchesAssetFilter(object: CatalogObject, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [object.label, object.name, object.detail].some((value) =>
    String(value || '').toLowerCase().includes(needle)
  );
}
