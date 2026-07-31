const path = require('path');
const dotenv = require('dotenv');
const next = require('next');
const connectDB = require('./api/config/db');
const createApp = require('./api/app');

dotenv.config();

const port = Number.parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';

const nextApp = next({
  dev,
  hostname,
  port,
  dir: path.join(__dirname, 'client'),
});

const handle = nextApp.getRequestHandler();

async function start() {
  await connectDB();
  await nextApp.prepare();

  const server = createApp({
    fallback: (req, res) => handle(req, res),
  });

  server.listen(port, () => {
    console.log(`App ready on http://${hostname}:${port}`);
    console.log(`API health: http://${hostname}:${port}/api/health`);
  });
}

start().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
