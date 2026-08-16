/**
 * Legacy API-only entrypoint.
 * Prefer the unified Next.js app: `npm run dev` / `npm start` (root server.js).
 */
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const createApp = require('./app');

dotenv.config();

async function startServer() {
  await connectDB();
  const { startSyncStatusWatchdog } = require('./services/geoSyncService');
  startSyncStatusWatchdog();

  const app = createApp();
  const PORT = process.env.API_PORT || process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`API-only server on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    console.log('Tip: use root `npm run dev` to serve Next.js UI + API together.');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, createApp };
