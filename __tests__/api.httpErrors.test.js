const {
  HttpError,
  sendError,
  sendServerError,
  asyncHandler,
} = require('../api/utils/httpErrors');
const { errorHandler } = require('../api/middleware/errorMiddleware');

describe('httpErrors helpers', () => {
  let res;
  let statusMock;
  let jsonMock;
  let consoleErrorSpy;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn(() => ({ json: jsonMock }));
    res = { status: statusMock, headersSent: false };
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('sendError returns message and optional code without internals', () => {
    sendError(res, 400, 'Bad input.', { code: 'BAD_REQUEST' });
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ message: 'Bad input.', code: 'BAD_REQUEST' });
  });

  it('sendServerError logs the exception and omits details from the body', () => {
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

  it('sendServerError allows custom status and code', () => {
    const error = new Error('secret path C:\\Projects\\secrets.env');
    sendServerError(res, error, 'Error applying asset ACL', { status: 500, code: 'ACL_FAILED' });

    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Error applying asset ACL',
      code: 'ACL_FAILED',
    });
    expect(JSON.stringify(jsonMock.mock.calls[0][0])).not.toMatch(/secrets\.env|secret path/i);
  });

  it('HttpError carries status and code', () => {
    const err = new HttpError(404, 'Missing.', { code: 'NOT_FOUND' });
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.isOperational).toBe(true);
  });

  it('errorHandler formats HttpError without leaking cause', () => {
    const err = new HttpError(500, 'Error fetching users', {
      code: 'INTERNAL',
      cause: new Error('ECONNREFUSED mongodb://secret'),
    });
    errorHandler(err, {}, res, () => {});
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ message: 'Error fetching users', code: 'INTERNAL' });
    expect(JSON.stringify(jsonMock.mock.calls[0][0])).not.toMatch(/mongodb|ECONNREFUSED|secret/i);
  });

  it('errorHandler hides unexpected exception messages', () => {
    errorHandler(new Error('Cast to ObjectId failed for value "x"'), {}, res, () => {});
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ message: 'Internal server error.', code: 'INTERNAL' });
  });

  it('asyncHandler forwards rejections to next', async () => {
    const boom = new HttpError(400, 'Nope', { code: 'BAD_REQUEST' });
    const handler = asyncHandler(async () => {
      throw boom;
    });
    const next = jest.fn();
    await handler({}, {}, next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});
