import { canAccess, type AccessSnapshot } from '@/lib/access';

function snapshot(partial: Partial<AccessSnapshot>): AccessSnapshot {
  return {
    user: { id: 'u1', username: 'alice', email: 'a@example.com' },
    permissions: [],
    isAdmin: false,
    fetchedAt: Date.now(),
    sessionId: 's1',
    ...partial,
  };
}

describe('canAccess', () => {
  it('denies when snapshot is missing', () => {
    expect(canAccess(null, 'SURVEY:READ')).toBe(false);
  });

  it('uses isAdmin for identity resources', () => {
    expect(canAccess(snapshot({ isAdmin: false }), 'USER:READ')).toBe(false);
    expect(canAccess(snapshot({ isAdmin: true }), 'USER:DELETE')).toBe(true);
    expect(canAccess(snapshot({ isAdmin: true }), 'LOG:READ')).toBe(true);
  });

  it('allows class-wide asset grants', () => {
    const access = snapshot({
      permissions: [{ resourceType: 'SURVEY', permission: 'READ', target: '*', resourceId: null }],
    });
    expect(canAccess(access, 'SURVEY:READ', { resourceId: 'abc' })).toBe(true);
    expect(canAccess(access, 'SURVEY:CREATE', { classWideOnly: true })).toBe(false);
  });

  it('treats WRITE as CREATE for class-wide create', () => {
    const access = snapshot({
      permissions: [{ resourceType: 'SURVEY', permission: 'WRITE', target: '*', resourceId: null }],
    });
    expect(canAccess(access, 'SURVEY:CREATE', { classWideOnly: true })).toBe(true);
  });

  it('supports allowAnyInstance for list-style checks', () => {
    const access = snapshot({
      permissions: [
        { resourceType: 'SURVEY', permission: 'READ', target: 'S1', resourceId: 'abc' },
      ],
    });
    expect(canAccess(access, 'SURVEY:READ', { allowAnyInstance: true })).toBe(true);
    expect(canAccess(access, 'SURVEY:READ', { resourceId: 'other' })).toBe(false);
  });
});
