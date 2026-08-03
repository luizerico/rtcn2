const mongoose = require('mongoose');

/**
 * Lightweight shared request validation (no external schema lib).
 * Throw ValidationError from helpers / validators; use `validate()` middleware
 * or `collectValidationError()` in controllers.
 */

class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.code = 'VALIDATION_ERROR';
    this.details = details;
  }
}

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function requirePresent(value, label) {
  if (isBlank(value)) {
    throw new ValidationError(`${label} is required.`);
  }
  return value;
}

function nonEmptyString(value, label, { minLength, maxLength, trim = true } = {}) {
  requirePresent(value, label);
  const str = trim ? String(value).trim() : String(value);
  if (!str) {
    throw new ValidationError(`${label} is required.`);
  }
  if (minLength != null && str.length < minLength) {
    throw new ValidationError(`${label} must be at least ${minLength} characters.`);
  }
  if (maxLength != null && str.length > maxLength) {
    throw new ValidationError(`${label} must be at most ${maxLength} characters.`);
  }
  return str;
}

function requireFields(source, fields, { message } = {}) {
  const missing = fields.filter((field) => isBlank(source?.[field]));
  if (missing.length) {
    throw new ValidationError(message || `Missing required fields: ${missing.join(', ')}.`);
  }
  return source;
}

function objectId(value, label = 'id') {
  requirePresent(value, label);
  const id = String(value).trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError(`Invalid ${label}.`);
  }
  return id;
}

function password(value, { label = 'Password', minLength = 8 } = {}) {
  return nonEmptyString(value, label, { minLength, trim: false });
}

function oneOf(value, allowed, label, { normalize = (v) => v } = {}) {
  requirePresent(value, label);
  const normalized = normalize(value);
  if (!allowed.includes(normalized)) {
    throw new ValidationError(`Invalid ${label}. Allowed: ${allowed.join(', ')}.`);
  }
  return normalized;
}

function booleanFlag(value, { defaultValue = false } = {}) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  throw new ValidationError('Invalid boolean value.');
}

/**
 * Parse page/limit with a hard cap so list endpoints stay bounded.
 */
function parsePagination(query = {}, { defaultLimit = 25, maxLimit = 100, defaultPage = 1 } = {}) {
  const rawLimit = query.limit;
  const rawPage = query.page;

  let limit = Number(rawLimit);
  if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
    limit = defaultLimit;
  } else if (!Number.isFinite(limit) || limit < 1) {
    throw new ValidationError('limit must be a positive integer.');
  }
  limit = Math.min(maxLimit, Math.max(1, Math.floor(limit)));

  let page = Number(rawPage);
  if (rawPage === undefined || rawPage === null || rawPage === '') {
    page = defaultPage;
  } else if (!Number.isFinite(page) || page < 1) {
    throw new ValidationError('page must be a positive integer.');
  }
  page = Math.max(1, Math.floor(page));

  return { page, limit, maxLimit };
}

function emailString(value, label = 'Email') {
  const email = nonEmptyString(value, label, { maxLength: 254 });
  // Practical check aligned with common API expectations (not full RFC).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError(`${label} must be a valid email address.`);
  }
  return email.toLowerCase();
}

function collectValidationError(error) {
  if (error instanceof ValidationError) {
    return {
      status: 400,
      body: {
        message: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }
  return null;
}

module.exports = {
  ValidationError,
  isBlank,
  requirePresent,
  requireFields,
  nonEmptyString,
  objectId,
  password,
  oneOf,
  booleanFlag,
  parsePagination,
  emailString,
  collectValidationError,
};
