'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/apiUtils';
import type { CatalogClass, CatalogPrincipal } from './types';

export function usePermissionCatalog(isOpen: boolean) {
  const [classes, setClasses] = useState<CatalogClass[]>([]);
  const [users, setUsers] = useState<CatalogPrincipal[]>([]);
  const [groups, setGroups] = useState<CatalogPrincipal[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      return;
    }

    setCatalogLoading(true);
    setError(null);

    apiGet<{
      classes: CatalogClass[];
      principals: { users: CatalogPrincipal[]; groups: CatalogPrincipal[] };
    }>('/permissions/catalog')
      .then((catalog) => {
        setClasses(catalog.classes || []);
        setUsers(catalog.principals?.users || []);
        setGroups(catalog.principals?.groups || []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load catalog.');
      })
      .finally(() => setCatalogLoading(false));
  }, [isOpen]);

  return {
    classes,
    users,
    groups,
    catalogLoading,
    error,
    setError,
  };
}
