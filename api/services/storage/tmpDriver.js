const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { HttpError, ERROR_CODES } = require('../../utils/httpErrors');

function resolveTmpRoot() {
  const raw = process.env.FILE_STORAGE_TMP_DIR || 'tmp/uploads';
  return path.resolve(process.cwd(), raw);
}

function assertSafeKey(key) {
  if (typeof key !== 'string' || !key.trim()) {
    throw new HttpError(400, 'Invalid storage key.', { code: ERROR_CODES.VALIDATION });
  }
  if (key.includes('\0') || key.includes('..') || path.isAbsolute(key) || key.includes('\\')) {
    throw new HttpError(400, 'Invalid storage key.', { code: ERROR_CODES.VALIDATION });
  }
  if (!/^[a-zA-Z0-9._/-]+$/.test(key)) {
    throw new HttpError(400, 'Invalid storage key.', { code: ERROR_CODES.VALIDATION });
  }
}

function resolveKeyPath(root, key) {
  assertSafeKey(key);
  const dest = path.resolve(root, ...key.split('/').filter(Boolean));
  const rel = path.relative(root, dest);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new HttpError(400, 'Invalid storage key.', { code: ERROR_CODES.VALIDATION });
  }
  return dest;
}

function notFoundError() {
  return new HttpError(404, 'File not found in storage.', { code: ERROR_CODES.NOT_FOUND });
}

function createTmpDriver() {
  const root = resolveTmpRoot();

  return {
    name: 'tmp',
    async put({ key, buffer }) {
      const dest = resolveKeyPath(root, key);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, buffer);
    },
    async get(key) {
      const dest = resolveKeyPath(root, key);
      try {
        const stat = await fsp.stat(dest);
        if (!stat.isFile()) throw notFoundError();
        return {
          stream: fs.createReadStream(dest),
          contentLength: stat.size,
        };
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (error && error.code === 'ENOENT') throw notFoundError();
        throw error;
      }
    },
    async remove(key) {
      const dest = resolveKeyPath(root, key);
      try {
        await fsp.unlink(dest);
      } catch (error) {
        if (error && error.code === 'ENOENT') return;
        throw error;
      }
    },
  };
}

module.exports = { createTmpDriver, resolveTmpRoot };
