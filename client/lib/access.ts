/**
 * Client-side access helpers mirroring API RBAC rules.
 * Identity resources (USER/GROUP/LOG) use isAdmin; assets use permission rows.
 */

export type AccessAction = 'READ' | 'WRITE' | 'CREATE' | 'DELETE' | 'ADMIN';

export interface AccessGrant {
  resourceType: string;
  permission: string;
  target?: string;
  resourceId?: string | null;
}

export interface AccessUser {
  id: string;
  username: string;
  email: string;
  roleId?: string | null;
  isVerified?: boolean;
}

export interface AccessSnapshot {
  user: AccessUser;
  permissions: AccessGrant[];
  isAdmin: boolean;
  fetchedAt: number;
  sessionId: string | null;
}

export interface CanOptions {
  resourceId?: string | null;
  /** Match list endpoints: any instance grant counts when no resourceId. */
  allowAnyInstance?: boolean;
  /** Match CREATE: only class-wide grants (target * / no resourceId). */
  classWideOnly?: boolean;
}

const IDENTITY_TYPES = new Set(['USER', 'GROUP', 'LOG']);

function isClassWide(grant: AccessGrant): boolean {
  return !grant.resourceId && (grant.target === '*' || grant.target === '' || !grant.target);
}

function collectGrantedActions(
  permissions: AccessGrant[],
  resourceType: string,
  options: CanOptions = {}
): Set<string> {
  const granted = new Set<string>();
  const { resourceId, allowAnyInstance = false, classWideOnly = false } = options;

  for (const policy of permissions) {
    if (String(policy.resourceType).toUpperCase() !== resourceType) continue;

    if (isClassWide(policy)) {
      granted.add(String(policy.permission).toUpperCase());
      continue;
    }

    if (classWideOnly) continue;

    if (resourceId && policy.resourceId && String(policy.resourceId) === String(resourceId)) {
      granted.add(String(policy.permission).toUpperCase());
      continue;
    }

    if (!resourceId && allowAnyInstance && policy.resourceId) {
      granted.add(String(policy.permission).toUpperCase());
    }
  }

  return granted;
}

function actionIsAllowed(requiredAction: string, granted: Set<string>): boolean {
  if (granted.has('ADMIN') || granted.has(requiredAction)) return true;
  return requiredAction === 'CREATE' && granted.has('WRITE');
}

export function parsePermissionString(
  permission: string
): { resourceType: string; action: string; identity: boolean } | null {
  if (!permission.includes(':')) return null;
  const [resourceTypeRaw, actionRaw] = permission.split(':');
  const resourceType = String(resourceTypeRaw || '').toUpperCase();
  const action = String(actionRaw || '').toUpperCase();
  if (!resourceType || !action) return null;
  if (IDENTITY_TYPES.has(resourceType)) {
    return { resourceType, action, identity: true };
  }
  return { resourceType, action, identity: false };
}

/** Evaluate a permission string against a cached access snapshot. */
export function canAccess(
  snapshot: AccessSnapshot | null | undefined,
  permission: string,
  options: CanOptions = {}
): boolean {
  if (!snapshot) return false;
  const parsed = parsePermissionString(permission);
  if (!parsed) return false;

  if (parsed.identity) {
    return Boolean(snapshot.isAdmin);
  }

  const checkOptions: CanOptions = { ...options };
  if (options.classWideOnly) {
    checkOptions.resourceId = undefined;
    checkOptions.allowAnyInstance = false;
  }

  return actionIsAllowed(
    parsed.action,
    collectGrantedActions(snapshot.permissions || [], parsed.resourceType, checkOptions)
  );
}
