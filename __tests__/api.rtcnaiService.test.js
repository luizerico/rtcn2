/**
 * @jest-environment node
 */

const {
  analysisLocationForStoredFile,
  parseAzureAccountName,
  isAnalyzableMime,
  fundingPrompt,
  findQueueJob,
  DEFAULT_FUNDING_PROMPT,
} = require('../api/services/rtcnaiService');
const { HttpError } = require('../api/utils/httpErrors');

describe('rtcnaiService URI mapping', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env.AWS_S3_BUCKET = original.AWS_S3_BUCKET;
    process.env.GCS_BUCKET = original.GCS_BUCKET;
    process.env.AZURE_STORAGE_CONTAINER = original.AZURE_STORAGE_CONTAINER;
    process.env.AZURE_STORAGE_CONNECTION_STRING = original.AZURE_STORAGE_CONNECTION_STRING;
    process.env.RTCNAI_PROMPT = original.RTCNAI_PROMPT;
    delete process.env.AWS_S3_BUCKET;
    delete process.env.GCS_BUCKET;
    delete process.env.AZURE_STORAGE_CONTAINER;
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.RTCNAI_PROMPT;
    if (original.AWS_S3_BUCKET) process.env.AWS_S3_BUCKET = original.AWS_S3_BUCKET;
    if (original.GCS_BUCKET) process.env.GCS_BUCKET = original.GCS_BUCKET;
    if (original.AZURE_STORAGE_CONTAINER) {
      process.env.AZURE_STORAGE_CONTAINER = original.AZURE_STORAGE_CONTAINER;
    }
    if (original.AZURE_STORAGE_CONNECTION_STRING) {
      process.env.AZURE_STORAGE_CONNECTION_STRING = original.AZURE_STORAGE_CONNECTION_STRING;
    }
    if (original.RTCNAI_PROMPT) process.env.RTCNAI_PROMPT = original.RTCNAI_PROMPT;
  });

  it('maps tmp storageKey as a relative URI', () => {
    expect(
      analysisLocationForStoredFile({
        storageDriver: 'tmp',
        storageKey: 'opportunity/abc/file.pdf',
      })
    ).toEqual({ provider: 'tmp', uri: 'opportunity/abc/file.pdf' });
  });

  it('maps aws driver to s3 URI', () => {
    process.env.AWS_S3_BUCKET = 'rtcn-files';
    expect(
      analysisLocationForStoredFile({
        storageDriver: 'aws',
        storageKey: 'opportunity/abc/file.pdf',
      })
    ).toEqual({ provider: 's3', uri: 's3://rtcn-files/opportunity/abc/file.pdf' });
  });

  it('maps gcs driver to gs URI', () => {
    process.env.GCS_BUCKET = 'rtcn-gcs';
    expect(
      analysisLocationForStoredFile({
        storageDriver: 'gcs',
        storageKey: 'opportunity/abc/file.pdf',
      })
    ).toEqual({ provider: 'gcs', uri: 'gs://rtcn-gcs/opportunity/abc/file.pdf' });
  });

  it('maps azure driver using AccountName from the connection string', () => {
    process.env.AZURE_STORAGE_CONTAINER = 'uploads';
    process.env.AZURE_STORAGE_CONNECTION_STRING =
      'DefaultEndpointsProtocol=https;AccountName=myacct;AccountKey=abc;EndpointSuffix=core.windows.net';
    expect(parseAzureAccountName(process.env.AZURE_STORAGE_CONNECTION_STRING)).toBe('myacct');
    expect(
      analysisLocationForStoredFile({
        storageDriver: 'azure',
        storageKey: 'opportunity/abc/file.pdf',
      })
    ).toEqual({
      provider: 'azure',
      uri: 'https://myacct.blob.core.windows.net/uploads/opportunity/abc/file.pdf',
    });
  });

  it('rejects azure mapping when the account name is missing', () => {
    process.env.AZURE_STORAGE_CONTAINER = 'uploads';
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'AccountKey=abc';
    expect(() =>
      analysisLocationForStoredFile({
        storageDriver: 'azure',
        storageKey: 'opportunity/abc/file.pdf',
      })
    ).toThrow(HttpError);
  });

  it('allows PDF and DOCX MIME types only', () => {
    expect(isAnalyzableMime('application/pdf')).toBe(true);
    expect(
      isAnalyzableMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toBe(true);
    expect(isAnalyzableMime('image/png')).toBe(false);
    expect(
      isAnalyzableMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    ).toBe(false);
  });

  it('uses the default funding prompt unless RTCNAI_PROMPT is set', () => {
    expect(fundingPrompt()).toBe(DEFAULT_FUNDING_PROMPT);
    process.env.RTCNAI_PROMPT = 'Custom prompt';
    expect(fundingPrompt()).toBe('Custom prompt');
  });

  it('finds a queue job by id or storage uri', () => {
    const queue = {
      queued: [{ job_id: 'job-a', uri: 'opportunity/abc/file.pdf', outcome: 'queued', position: 2 }],
      running: [{ job_id: 'job-b', uri: 's3://bucket/other.pdf', outcome: 'running' }],
    };
    expect(findQueueJob(queue, { jobId: 'job-b' }).job_id).toBe('job-b');
    expect(findQueueJob(queue, { uri: 'opportunity/abc/file.pdf' }).position).toBe(2);
    expect(findQueueJob(queue, { jobId: 'missing', uri: 'nope.pdf' })).toBeNull();
  });
});
