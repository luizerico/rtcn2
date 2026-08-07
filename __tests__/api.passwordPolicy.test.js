/**
 * @jest-environment node
 */

const {
  MIN_PASSWORD_LENGTH,
  PASSWORD_POLICY_MESSAGE,
  assertPasswordPolicy,
} = require('../api/utils/passwordPolicy');

describe('passwordPolicy', () => {
  it('exposes the shared minimum length', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('rejects missing or empty passwords', () => {
    expect(assertPasswordPolicy(undefined).ok).toBe(false);
    expect(assertPasswordPolicy(null).ok).toBe(false);
    expect(assertPasswordPolicy('').ok).toBe(false);
    expect(assertPasswordPolicy(12345678).ok).toBe(false);
  });

  it('rejects passwords shorter than the minimum', () => {
    const result = assertPasswordPolicy('short');
    expect(result.ok).toBe(false);
    expect(result.message).toBe(PASSWORD_POLICY_MESSAGE);
  });

  it('accepts passwords that meet the minimum', () => {
    const result = assertPasswordPolicy('12345678');
    expect(result).toEqual({ ok: true, password: '12345678' });
  });
});
