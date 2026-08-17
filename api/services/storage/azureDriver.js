function createAzureDriver() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER;
  if (!connectionString || !containerName) {
    throw new Error(
      'Azure storage requires AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER.'
    );
  }

  const { BlobServiceClient } = require('@azure/storage-blob');
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient(containerName);

  return {
    name: 'azure',
    async put({ key, buffer, contentType }) {
      await container.getBlockBlobClient(key).uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: contentType },
      });
    },
    async get(key) {
      const blob = container.getBlockBlobClient(key);
      const exists = await blob.exists();
      if (!exists) {
        const error = new Error('File not found in storage.');
        error.status = 404;
        throw error;
      }
      const download = await blob.download();
      return {
        stream: download.readableStreamBody,
        contentType: download.contentType,
        contentLength: download.contentLength,
      };
    },
    async remove(key) {
      await container.getBlockBlobClient(key).deleteIfExists();
    },
  };
}

module.exports = { createAzureDriver };
