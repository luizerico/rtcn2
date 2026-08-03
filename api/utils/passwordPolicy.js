/** Minimum length enforced across register, create, reset, and change flows. */
const PASSWORD_MIN_LENGTH = 8;

/**
 * Shared password policy check.
 * @param {unknown} password
 * @param {{ label?: string }} [options]
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function assertPasswordPolicy(password, { label = 'Password' } = {}) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `${label} must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  return { ok: true };
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  assertPasswordPolicy,
};
