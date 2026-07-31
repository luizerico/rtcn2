/**
 * Resolve MongoDB connection string from environment.
 * When root credentials are present but missing from the URI, inject them
 * (common when using docker-compose Mongo with host port mapping).
 */
function resolveMongoUri() {
  const configured =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    'mongodb://localhost:27017/projects';

  const rootUser = process.env.MONGO_ROOT_USER;
  const rootPass = process.env.MONGO_ROOT_PASS;

  // Already contains credentials.
  if (configured.includes('@')) {
    return ensureAuthSource(configured);
  }

  // Docker Compose Mongo requires root auth on the host-mapped port.
  if (rootUser && rootPass) {
    try {
      const url = new URL(configured);
      url.username = rootUser;
      url.password = rootPass;
      if (!url.searchParams.has('authSource')) {
        url.searchParams.set('authSource', 'admin');
      }
      return url.toString();
    } catch {
      const withoutScheme = configured.replace(/^mongodb(\+srv)?:\/\//, '');
      return `mongodb://${encodeURIComponent(rootUser)}:${encodeURIComponent(rootPass)}@${withoutScheme}${
        configured.includes('?') ? '&' : '?'
      }authSource=admin`.replace('?&', '?');
    }
  }

  return configured;
}

function ensureAuthSource(uri) {
  if (uri.includes('authSource=')) {
    return uri;
  }
  return `${uri}${uri.includes('?') ? '&' : '?'}authSource=admin`;
}

module.exports = {
  resolveMongoUri,
};
