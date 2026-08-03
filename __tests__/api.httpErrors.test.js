const { sendServerError } = require('../api/utils/httpErrors');

describe('sendServerError', () => {
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

  it('returns a generic message and code without leaking exception details', () => {
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

  it('allows custom status and code while still omitting internals', () => {
    const error = new Error('secret path C:\\Projects\\secrets.env');
    sendServerError(res, error, 'Error applying asset ACL', { status: 500, code: 'ACL_FAILED' });

    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Error applying asset ACL',
      code: 'ACL_FAILED',
    });
    expect(JSON.stringify(jsonMock.mock.calls[0][0])).not.toMatch(/secrets\.env|secret path/i);
  });
});
