const { parsePagination } = require('../validation');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {Record<string, unknown>} query
 * @param {Set<string>|string[]} sortableFields
 * @param {string} defaultSort
 * @returns {{ page: number, limit: number, sortField: string, sortOrder: 1|-1, orderLabel: 'asc'|'desc' }}
 */
function parseListQuery(query, sortableFields, defaultSort = 'createdAt', options = {}) {
  const allowed = sortableFields instanceof Set ? sortableFields : new Set(sortableFields);
  const sortField = allowed.has(query.sort) ? String(query.sort) : defaultSort;
  const sortOrder = String(query.order || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const { page, limit } = parsePagination(query, {
    defaultLimit: options.defaultLimit || 25,
    maxLimit: options.maxLimit || 100,
  });
  return {
    page,
    limit,
    sortField,
    sortOrder,
    orderLabel: sortOrder === 1 ? 'asc' : 'desc',
  };
}

/**
 * Clamp page after counting totals.
 */
function clampPage(page, total, limit) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  let nextPage = page;
  if (totalPages > 0 && nextPage > totalPages) nextPage = totalPages;
  return {
    page: nextPage,
    totalPages,
    skip: (nextPage - 1) * limit,
  };
}

function paginatedResponse({ items, total, page, limit, sortField, orderLabel }) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: totalPages > 0 && page < totalPages,
    },
    sort: { field: sortField, order: orderLabel },
  };
}

function textSearchOr(fields, q) {
  const trimmed = typeof q === 'string' ? q.trim() : '';
  if (!trimmed) return null;
  const regex = { $regex: escapeRegex(trimmed), $options: 'i' };
  return fields.map((field) => ({ [field]: regex }));
}

module.exports = {
  escapeRegex,
  parseListQuery,
  clampPage,
  paginatedResponse,
  textSearchOr,
};
