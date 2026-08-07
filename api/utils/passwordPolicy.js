/** Shared minimum password policy for register, create, reset, and change flows. */
const MIN_PASSWORD_LENGTH = 8;

const PASSWORD_POLICY_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;

/**
 * @param {unknown} password
 * @returns {{ ok: true, password: string } | { ok: false, message: string }}
 */
function assertPasswordPolicy(password) {
  if (password == null || typeof password !== 'string' || password.length === 0) {
    return { ok: false, message: 'Password is required.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: PASSWORD_POLICY_MESSAGE };
  }
  return { ok: true, password };
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  PASSWORD_POLICY_MESSAGE,
  assertPasswordPolicy,
};
