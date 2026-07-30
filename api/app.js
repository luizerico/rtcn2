const express = require('express');
const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const objectRoutes = require('./routes/objectRoutes');

/**
 * Build the Express application without connecting to MongoDB or listening.
 * Used by the HTTP server and by automated API tests.
 */
function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/objects', objectRoutes);

  app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Internal server error.' });
  });

  return app;
}

module.exports = createApp;
