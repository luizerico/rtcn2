const express = require('express');
const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const assetRoutes = require('./routes/assetRoutes');
const surveyRoutes = require('./routes/surveyRoutes');
const userRoutes = require('./routes/userRoutes');
const actionLogRoutes = require('./routes/actionLogRoutes');
const { actionLogMiddleware } = require('./middleware/actionLogMiddleware');
const { securityHeaders, apiRateLimiter, authRateLimiter } = require('./middleware/security');
const { errorHandler } = require('./middleware/errorMiddleware');

// Register Asset subclasses (discriminators) once for the API process.
require('./models/assets');

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '100kb';

/**
 * Build the Express application with API routes.
 * Optional `fallback` handles non-API traffic (used by the unified Next.js server).
 */
function createApp({ fallback } = {}) {
  const app = express();

  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(securityHeaders());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(actionLogMiddleware);

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api', apiRateLimiter());
  app.use('/api/auth', authRateLimiter());

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/api/surveys', surveyRoutes);
  app.use('/api/permissions', require('./routes/permissionRoutes'));
  app.use('/api/logs', actionLogRoutes);
  app.use('/api/reports', require('./routes/reportsProxyRoutes'));

  if (typeof fallback === 'function') {
    app.use(fallback);
  }

  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      return res.status(413).json({ message: 'Request body too large.', code: 'PAYLOAD_TOO_LARGE' });
    }
    return errorHandler(err, req, res, next);
  });

  return app;
}

module.exports = createApp;
