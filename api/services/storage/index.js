let cached;

function normalizeDriverName(raw) {
  const name = String(raw || 'tmp')
    .toLowerCase()
    .trim();
  if (name === 'google' || name === 'gcp') return 'gcs';
  if (name === 's3') return 'aws';
  return name;
}

function createStorageDriver() {
  const raw = process.env.FILE_STORAGE_DRIVER || 'tmp';
  const name = normalizeDriverName(raw);
  switch (name) {
    case 'tmp':
      return require('./tmpDriver').createTmpDriver();
    case 'azure':
      return require('./azureDriver').createAzureDriver();
    case 'aws':
      return require('./awsDriver').createAwsDriver();
    case 'gcs':
      return require('./gcsDriver').createGcsDriver();
    default:
      throw new Error(`Unknown FILE_STORAGE_DRIVER "${raw}". Use tmp, azure, aws, or gcs.`);
  }
}

function getStorageDriver() {
  if (!cached) {
    cached = createStorageDriver();
  }
  return cached;
}

function resetStorageDriverForTests() {
  cached = null;
}

module.exports = {
  createStorageDriver,
  getStorageDriver,
  resetStorageDriverForTests,
  normalizeDriverName,
};
