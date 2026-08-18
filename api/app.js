const express = require('express');
const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const assetRoutes = require('./routes/assetRoutes');
const surveyRoutes = require('./routes/surveyRoutes');
const userRoutes = require('./routes/userRoutes');
const actionLogRoutes = require('./routes/actionLogRoutes');
const { createGeoRouter } = require('./routes/geoRoutes');
const {
  listRegions,
  getRegionById,
  listStates,
  getStateById,
  listMicroregions,
  getMicroregionById,
  listBiomes,
  getBiomeById,
} = require('./controllers/geoController');
const countyRoutes = require('./routes/countyRoutes');
const { actionLogMiddleware } = require('./middleware/actionLogMiddleware');
const { securityHeaders, apiRateLimiter, authRateLimiter } = require('./middleware/security');
const { errorHandler } = require('./middleware/errorMiddleware');

// Register concrete Asset subclass models once for the API process.
require('./models/assets');
require('./models/survey');
require('./models/geo');
require('./models/StoredFile');

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '2mb';

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
  // Count only failed password logins toward the auth lockout (not register/me/etc.).
  app.use('/api/auth/login', authRateLimiter());

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/api/surveys', surveyRoutes);
  app.use('/api/sponsors', require('./routes/sponsorRoutes'));
  app.use('/api/opportunities', require('./routes/opportunityRoutes'));
  app.use('/api/files', require('./routes/storedFileRoutes'));
  app.use('/api/bin', require('./routes/recycleBinRoutes'));
  app.use('/api/projects', require('./routes/projectRoutes'));
  app.use('/api/permissions', require('./routes/permissionRoutes'));
  app.use('/api/logs', actionLogRoutes);
  app.use(
    '/api/regions',
    createGeoRouter({ list: listRegions, getById: getRegionById, idLabel: 'Region id' })
  );
  app.use(
    '/api/states',
    createGeoRouter({ list: listStates, getById: getStateById, idLabel: 'State id' })
  );
  app.use(
    '/api/microregions',
    createGeoRouter({
      list: listMicroregions,
      getById: getMicroregionById,
      idLabel: 'Microregion id',
    })
  );
  app.use(
    '/api/biomes',
    createGeoRouter({ list: listBiomes, getById: getBiomeById, idLabel: 'Biome id' })
  );
  app.use('/api/counties', countyRoutes);
  app.use('/api/geo/malhas', require('./routes/malhasRoutes'));
  app.use('/api/geo', require('./routes/geoSyncRoutes'));
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
