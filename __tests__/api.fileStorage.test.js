/**
 * @jest-environment node
 */

const {
  createStorageDriver,
  resetStorageDriverForTests,
} = require('../api/services/storage');

describe('storage driver factory', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env.FILE_STORAGE_DRIVER = original.FILE_STORAGE_DRIVER;
    process.env.AZURE_STORAGE_CONNECTION_STRING = original.AZURE_STORAGE_CONNECTION_STRING;
    process.env.AZURE_STORAGE_CONTAINER = original.AZURE_STORAGE_CONTAINER;
    process.env.AWS_S3_BUCKET = original.AWS_S3_BUCKET;
    process.env.AWS_S3_REGION = original.AWS_S3_REGION;
    process.env.GCS_BUCKET = original.GCS_BUCKET;
    resetStorageDriverForTests();
  });

  it('defaults to tmp', () => {
    delete process.env.FILE_STORAGE_DRIVER;
    resetStorageDriverForTests();
    expect(createStorageDriver().name).toBe('tmp');
  });

  it('rejects unknown drivers', () => {
    process.env.FILE_STORAGE_DRIVER = 'ftp';
    expect(() => createStorageDriver()).toThrow(/Unknown FILE_STORAGE_DRIVER/);
  });

  it('requires azure config', () => {
    process.env.FILE_STORAGE_DRIVER = 'azure';
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.AZURE_STORAGE_CONTAINER;
    expect(() => createStorageDriver()).toThrow(/AZURE_STORAGE/);
  });

  it('requires aws config', () => {
    process.env.FILE_STORAGE_DRIVER = 'aws';
    delete process.env.AWS_S3_BUCKET;
    delete process.env.AWS_S3_REGION;
    expect(() => createStorageDriver()).toThrow(/AWS_S3/);
  });

  it('requires gcs config', () => {
    process.env.FILE_STORAGE_DRIVER = 'google';
    delete process.env.GCS_BUCKET;
    expect(() => createStorageDriver()).toThrow(/GCS_BUCKET/);
  });
});
