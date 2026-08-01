const express = require('express');
const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const assetRoutes = require('./routes/assetRoutes');
const surveyRoutes = require('./routes/surveyRoutes');
const userRoutes = require('./routes/userRoutes');

// Register Asset subclasses (discriminators) once for the API process.
require('./models/assets');

/**
 * Build the Express application with API routes.
 * Optional `fallback` handles non-API traffic (used by the unified Next.js server).
 */
function createApp({ fallback } = {}) {
  const app = express();

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/api/surveys', surveyRoutes);
  app.use('/api/permissions', require('./routes/permissionRoutes'));

  if (typeof fallback === 'function') {
    app.use(fallback);
  }

  app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Internal server error.' });
  });

  return app;
}

module.exports = createApp;
