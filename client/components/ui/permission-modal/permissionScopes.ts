import type { PermissionLevel } from './types';

/** Windows-style order: Full control → Modify → Read → Create → Delete */
export const PERMISSION_LEVELS: PermissionLevel[] = [
  'ADMIN',
  'WRITE',
  'READ',
  'CREATE',
  'DELETE',
];

export const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  ADMIN: 'Full control',
  WRITE: 'Modify',
  READ: 'Read',
  CREATE: 'Create',
  DELETE: 'Delete',
};

export const emptyScopes = (): Record<PermissionLevel, boolean> => ({
  ADMIN: false,
  WRITE: false,
  READ: false,
  CREATE: false,
  DELETE: false,
});

export function scopesToMap(scopes: string[]): Record<PermissionLevel, boolean> {
  const next = emptyScopes();
  for (const scope of scopes) {
    if (scope in next) next[scope as PermissionLevel] = true;
  }
  return next;
}

export function mapToScopes(map: Record<PermissionLevel, boolean>): PermissionLevel[] {
  return PERMISSION_LEVELS.filter((level) => map[level]);
}
