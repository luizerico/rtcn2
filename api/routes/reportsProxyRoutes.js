const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');

const router = express.Router();

function reportsBaseUrl() {
  return String(process.env.REPORTS_URL || 'http://localhost:8000').replace(/\/$/, '');
}

async function forwardJson(req, res, path, { method = 'GET', body } = {}) {
  const url = `${reportsBaseUrl()}${path}`;
  const headers = {
    Accept: 'application/json',
  };
  if (req.authToken) {
    headers.Authorization = `Bearer ${req.authToken}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let upstream;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    return sendServerError(res, error, 'Reports service is unreachable.');
  }

  const text = await upstream.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text || 'Invalid reports response.' };
  }

  return res.status(upstream.status).json(payload);
}

// Cookie or Bearer session required; upstream reports service enforces admin RBAC.
router.use(protect);

router.get('/health', async (req, res) => {
  return forwardJson(req, res, '/health');
});

router.post('/graphql', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return sendError(res, 400, 'GraphQL body is required.', ERROR_CODES.VALIDATION);
  }
  return forwardJson(req, res, '/graphql', { method: 'POST', body: req.body });
});

module.exports = router;
