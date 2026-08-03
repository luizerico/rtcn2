const {
  sendServerError,
  sendError,
  buildErrorBody,
  ERROR_CODES,
  errorHandler,
  HttpError,
} = require('../api/utils/httpErrors');

describe('httpErrors helpers', () => {
  let res;
  let statusMock;
  let jsonMock;
  let consoleErrorSpy;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn(() => ({ json: jsonMock }));
    res = { status: statusMock };
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('sendServerError returns message+code without leaking exception details', () => {
    const error = new Error('E11000 duplicate key at path "users.email" /data/db/wiredTiger');
    sendServerError(res, error, 'Error fetching users');

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching users', error);
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Error fetching users',
      code: 'INTERNAL',
    });

    const body = jsonMock.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain(error.message);
    expect(body).not.toHaveProperty('error');
    expect(body).not.toHaveProperty('stack');
  });

  it('sendServerError allows custom status and code while still omitting internals', () => {
    const error = new Error('secret path C:\\Projects\\secrets.env');
    sendServerError(res, error, 'Error applying asset ACL', { status: 500, code: 'ACL_FAILED' });

    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Error applying asset ACL',
      code: 'ACL_FAILED',
    });
    expect(JSON.stringify(jsonMock.mock.calls[0][0])).not.toMatch(/secrets\.env|secret path/i);
  });

  it('sendError standardizes intentional client errors with optional details', () => {
    expect(buildErrorBody('Nope', ERROR_CODES.VALIDATION)).toEqual({
      message: 'Nope',
      code: 'VALIDATION',
    });

    sendError(res, 403, 'Forbidden', ERROR_CODES.FORBIDDEN, {
      username: 'alice',
      hint: 'Grant access',
    });
    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Forbidden',
      code: 'FORBIDDEN',
      details: { username: 'alice', hint: 'Grant access' },
    });
  });

  it('errorHandler formats HttpError and unknown failures', () => {
    errorHandler(new HttpError(400, 'Bad input', ERROR_CODES.VALIDATION, { field: 'name' }), {}, res, () => {});
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Bad input',
      code: 'VALIDATION',
      details: { field: 'name' },
    });

    jsonMock.mockClear();
    statusMock.mockClear();
    errorHandler(new Error('boom'), {}, res, () => {});
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Internal server error.',
      code: 'INTERNAL',
    });
  });
});
