function createGcsDriver() {
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) {
    throw new Error('Google storage requires GCS_BUCKET.');
  }

  const { Storage } = require('@google-cloud/storage');
  const options = {};
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    options.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  } else if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
    options.credentials = {
      client_email: process.env.GCS_CLIENT_EMAIL,
      private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
    if (process.env.GCS_PROJECT_ID) {
      options.projectId = process.env.GCS_PROJECT_ID;
    }
  }

  const storage = new Storage(options);
  const bucket = storage.bucket(bucketName);

  return {
    name: 'gcs',
    async put({ key, buffer, contentType }) {
      await bucket.file(key).save(buffer, { contentType, resumable: false });
    },
    async get(key) {
      const file = bucket.file(key);
      const [exists] = await file.exists();
      if (!exists) {
        const error = new Error('File not found in storage.');
        error.status = 404;
        throw error;
      }
      const [meta] = await file.getMetadata();
      return {
        stream: file.createReadStream(),
        contentType: meta.contentType,
        contentLength: meta.size ? Number(meta.size) : undefined,
      };
    },
    async remove(key) {
      await bucket.file(key).delete({ ignoreNotFound: true });
    },
  };
}

module.exports = { createGcsDriver };
