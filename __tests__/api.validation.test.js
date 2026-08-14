/**
 * @jest-environment node
 */

const {
  ValidationError,
  requireFields,
  nonEmptyString,
  objectId,
  password,
  parsePagination,
  emailString,
  collectValidationError,
} = require('../api/validation');
const {
  registerBody,
  loginBody,
  changePasswordBody,
  createGroupBody,
  groupMemberBody,
  createAssetBody,
} = require('../api/validation/schemas');
const { validate } = require('../api/middleware/validate');

describe('request validation helpers', () => {
  it('requireFields rejects missing values', () => {
    expect(() => requireFields({ a: 1 }, ['a', 'b'])).toThrow(ValidationError);
  });

  it('nonEmptyString trims and enforces minLength', () => {
    expect(nonEmptyString('  hi  ', 'Name')).toBe('hi');
    expect(() => password('short', { label: 'New password' })).toThrow(
      /at least 8 characters/
    );
  });

  it('objectId rejects invalid ids', () => {
    expect(() => objectId('not-an-id', 'User id')).toThrow(/Invalid User id/);
    expect(objectId('507f1f77bcf86cd799439011', 'User id')).toBe('507f1f77bcf86cd799439011');
  });

  it('parsePagination caps limit and defaults page', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 25, maxLimit: 100 });
    expect(parsePagination({ page: '2', limit: '500' }).limit).toBe(100);
    expect(() => parsePagination({ limit: '0' })).toThrow(/limit must be/);
  });

  it('emailString normalizes case', () => {
    expect(emailString('Alice@Example.COM')).toBe('alice@example.com');
    expect(() => emailString('not-email')).toThrow(/valid email/);
  });

  it('collectValidationError maps ValidationError to 400 body', () => {
    const handled = collectValidationError(new ValidationError('bad'));
    expect(handled).toEqual({
      status: 400,
      body: { message: 'bad', code: 'VALIDATION' },
    });
    expect(collectValidationError(new Error('other'))).toBeNull();
  });
});

describe('route schemas', () => {
  it('registerBody requires fields and password policy', () => {
    expect(() => registerBody({ body: { username: 'a' } })).toThrow(/all fields/i);
    expect(() =>
      registerBody({ body: { username: 'a', email: 'a@b.com', password: 'short' } })
    ).toThrow(/at least 8/);
    expect(
      registerBody({
        body: { username: ' alice ', email: 'Alice@Example.com', password: 'Password1' },
      })
    ).toEqual({
      username: 'alice',
      email: 'alice@example.com',
      password: 'Password1',
    });
  });

  it('loginBody requires email and password', () => {
    expect(loginBody({ body: { email: 'Alice@Example.com', password: 'x' } })).toEqual({
      email: 'alice@example.com',
      password: 'x',
    });
    expect(() => loginBody({ body: { username: 'a', password: 'x' } })).toThrow(
      /email and password/
    );
    expect(() => loginBody({ body: { email: 'a@b.com' } })).toThrow(/email and password/);
  });

  it('changePasswordBody enforces new password length', () => {
    expect(() =>
      changePasswordBody({ body: { currentPassword: 'old', newPassword: '123' } })
    ).toThrow(/at least 8/);
  });

  it('createGroupBody requires name', () => {
    expect(() => createGroupBody({ body: {} })).toThrow(/Group name is required/);
    expect(createGroupBody({ body: { name: ' ops ' } }).name).toBe('ops');
  });

  it('groupMemberBody validates ObjectIds', () => {
    expect(() =>
      groupMemberBody({
        params: { groupId: 'bad' },
        body: { targetUserId: '507f1f77bcf86cd799439011' },
      })
    ).toThrow(/Invalid Group id/);
  });

  it('createAssetBody rejects survey kinds and empty name', () => {
    expect(() => createAssetBody({ body: { kind: 'SURVEY', name: 'x' } })).toThrow(/surveys API/);
    expect(() => createAssetBody({ body: { kind: 'WIDGET', name: 'x' } })).toThrow(/Invalid asset kind/);
    expect(createAssetBody({ body: { name: ' Doc ' } }).kind).toBe('DOCUMENT');
  });
});

describe('validate middleware', () => {
  it('returns 400 JSON for ValidationError', () => {
    const mw = validate(() => {
      throw new ValidationError('nope');
    });
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const next = jest.fn();
    mw({}, { status }, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      message: 'nope',
      code: 'VALIDATION',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('stores validated payload and calls next', () => {
    const mw = validate(() => ({ ok: true }));
    const req = {};
    const next = jest.fn();
    mw(req, {}, next);
    expect(req.validated).toEqual({ ok: true });
    expect(next).toHaveBeenCalled();
  });
});
