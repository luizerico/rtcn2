/**
 * @jest-environment node
 */

const {
  PASSWORD_MIN_LENGTH,
  assertPasswordPolicy,
} = require('../api/utils/passwordPolicy');

describe('passwordPolicy', () => {
  it('exports the shared minimum length', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it('accepts passwords that meet the policy', () => {
    expect(assertPasswordPolicy('Password123!')).toEqual({ ok: true });
    expect(assertPasswordPolicy('12345678')).toEqual({ ok: true });
  });

  it('rejects short, missing, or non-string passwords', () => {
    expect(assertPasswordPolicy('short')).toEqual({
      ok: false,
      message: 'Password must be at least 8 characters.',
    });
    expect(assertPasswordPolicy('')).toEqual({
      ok: false,
      message: 'Password must be at least 8 characters.',
    });
    expect(assertPasswordPolicy(null)).toEqual({
      ok: false,
      message: 'Password must be at least 8 characters.',
    });
    expect(assertPasswordPolicy(12345678)).toEqual({
      ok: false,
      message: 'Password must be at least 8 characters.',
    });
  });

  it('supports a custom label for change/reset flows', () => {
    expect(assertPasswordPolicy('abc', { label: 'New password' })).toEqual({
      ok: false,
      message: 'New password must be at least 8 characters.',
    });
  });
});
