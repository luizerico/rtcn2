function createAwsDriver() {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_S3_REGION;
  if (!bucket || !region) {
    throw new Error('AWS storage requires AWS_S3_BUCKET and AWS_S3_REGION.');
  }

  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require(
    '@aws-sdk/client-s3'
  );

  const credentials =
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined;

  const client = new S3Client({
    region,
    credentials,
  });

  return {
    name: 'aws',
    async put({ key, buffer, contentType }) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );
    },
    async get(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return {
          stream: out.Body,
          contentType: out.ContentType,
          contentLength: out.ContentLength,
        };
      } catch (error) {
        if (error && (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)) {
          const notFound = new Error('File not found in storage.');
          notFound.status = 404;
          throw notFound;
        }
        throw error;
      }
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

module.exports = { createAwsDriver };
