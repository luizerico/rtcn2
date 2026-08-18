const path = require('path');
const { ValidationError } = require('../validation');

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 20;

const KIND_BY_EXT = {
  pdf: 'pdf',
  doc: 'doc',
  docx: 'docx',
  xls: 'xls',
  xlsx: 'xlsx',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
};

const MIMES_BY_KIND = {
  pdf: ['application/pdf'],
  doc: ['application/msword', 'application/octet-stream'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
  ],
  xls: ['application/vnd.ms-excel', 'application/octet-stream'],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
  ],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  gif: ['image/gif'],
  webp: ['image/webp'],
};

const CANONICAL_MIME = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

const EXT_BY_KIND = {
  pdf: '.pdf',
  doc: '.doc',
  docx: '.docx',
  xls: '.xls',
  xlsx: '.xlsx',
  jpeg: '.jpg',
  png: '.png',
  gif: '.gif',
  webp: '.webp',
};

const ALLOWED_LABEL = 'PDF, Word (DOC/DOCX), Excel (XLS/XLSX), and image files (JPEG, PNG, GIF, WEBP)';
const OLE_SIG = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function maxFileBytes() {
  const parsed = Number.parseInt(process.env.FILE_MAX_BYTES || String(DEFAULT_MAX_BYTES), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
}

function maxFileCount() {
  const parsed = Number.parseInt(process.env.FILE_MAX_COUNT || String(DEFAULT_MAX_FILES), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_FILES;
}

function extensionOf(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase().replace(/^\./, '');
  return ext;
}

function normalizeMime(mimeType) {
  return String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function looksLikePdf(buffer) {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF';
}

function looksLikeJpeg(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function looksLikePng(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIG);
}

function looksLikeGif(buffer) {
  if (buffer.length < 6) return false;
  const header = buffer.subarray(0, 6).toString('ascii');
  return header === 'GIF87a' || header === 'GIF89a';
}

function looksLikeWebp(buffer) {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

function looksLikeZip(buffer) {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  );
}

function looksLikeDocx(buffer) {
  if (!looksLikeZip(buffer)) return false;
  const ascii = buffer.toString('latin1');
  return ascii.includes('[Content_Types].xml') && ascii.includes('word/');
}

function looksLikeXlsx(buffer) {
  if (!looksLikeZip(buffer)) return false;
  const ascii = buffer.toString('latin1');
  return ascii.includes('[Content_Types].xml') && ascii.includes('xl/');
}

function looksLikeOle(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(OLE_SIG);
}

function sniffKind(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  if (looksLikePdf(buffer)) return 'pdf';
  if (looksLikeJpeg(buffer)) return 'jpeg';
  if (looksLikePng(buffer)) return 'png';
  if (looksLikeGif(buffer)) return 'gif';
  if (looksLikeWebp(buffer)) return 'webp';
  if (looksLikeDocx(buffer)) return 'docx';
  if (looksLikeXlsx(buffer)) return 'xlsx';
  if (looksLikeOle(buffer)) return 'ole';
  return null;
}

function sanitizeOriginalName(filename) {
  const base = path.basename(String(filename || '')).replace(/[\u0000-\u001f\u007f]/g, '');
  const trimmed = base.trim().slice(0, 255);
  if (!trimmed) {
    throw new ValidationError('File name is required.');
  }
  return trimmed;
}

function assertAllowedUploadMeta(originalName, mimeType) {
  const sanitized = sanitizeOriginalName(originalName);
  const ext = extensionOf(sanitized);
  const kind = KIND_BY_EXT[ext];
  if (!kind) {
    throw new ValidationError(`Only ${ALLOWED_LABEL} are allowed.`);
  }
  const mime = normalizeMime(mimeType);
  if (mime && !MIMES_BY_KIND[kind].includes(mime)) {
    throw new ValidationError('File type does not match the file extension.');
  }
  return { originalName: sanitized, ext, kind, mime };
}

function inspectUpload({ originalName, mimeType, buffer }) {
  const meta = assertAllowedUploadMeta(originalName, mimeType);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ValidationError('File content is required.');
  }
  const limit = maxFileBytes();
  if (buffer.length > limit) {
    const error = new ValidationError('File is too large.');
    error.statusCode = 413;
    error.code = 'PAYLOAD_TOO_LARGE';
    throw error;
  }
  const sniffed = sniffKind(buffer);
  if (!sniffed) {
    throw new ValidationError(`File content is not a supported ${ALLOWED_LABEL}.`);
  }
  const kind = sniffed === 'ole' && (meta.kind === 'doc' || meta.kind === 'xls') ? meta.kind : sniffed;
  if (kind !== meta.kind) {
    throw new ValidationError('File content does not match the declared file type.');
  }
  return {
    originalName: meta.originalName,
    kind,
    ext: EXT_BY_KIND[kind],
    mimeType: CANONICAL_MIME[kind],
    sizeBytes: buffer.length,
  };
}

const ACCEPT_ATTRIBUTE = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp';

module.exports = {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_FILES,
  ACCEPT_ATTRIBUTE,
  KIND_BY_EXT,
  CANONICAL_MIME,
  EXT_BY_KIND,
  maxFileBytes,
  maxFileCount,
  sanitizeOriginalName,
  assertAllowedUploadMeta,
  inspectUpload,
  sniffKind,
};
