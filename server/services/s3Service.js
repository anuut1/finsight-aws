const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const region = process.env.AWS_REGION || 'ap-south-1';
const bucketName = process.env.AWS_RECEIPTS_BUCKET || (process.env.NODE_ENV === 'production' ? '' : 'finsight-receipts-private-dev');
if (process.env.NODE_ENV === 'production' && !process.env.AWS_RECEIPTS_BUCKET) {
  console.warn('[AWS S3 Warning] AWS_RECEIPTS_BUCKET is not set in production. S3 receipt operations may fail.');
}

// S3 Client automatically resolves credentials:
// 1. In AWS App Runner / ECS: via IAM Task/Instance Role
// 2. Locally: via AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY or ~/.aws/credentials
const s3Client = new S3Client({
  region,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

/**
 * Generate a pre-signed S3 upload URL for direct, secure browser uploads.
 * This ensures large images never consume backend RAM or bandwidth.
 *
 * @param {string} userId - ID of the user uploading the receipt
 * @param {string} contentType - MIME type (image/jpeg, image/png, image/webp)
 * @returns {Promise<{ uploadUrl: string, key: string, bucket: string, expiresIn: number }>}
 */
async function generateReceiptUploadUrl(userId, contentType = 'image/jpeg', explicitFileId = null) {
  const fileId = explicitFileId || crypto.randomUUID();
  const ext = contentType.includes('png')
    ? 'png'
    : contentType.includes('pdf')
    ? 'pdf'
    : contentType.includes('heic') || contentType.includes('heif')
    ? 'heic'
    : contentType.includes('webp')
    ? 'webp'
    : 'jpg';
  const key = `receipts/${userId}/${fileId}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  // URL expires in 15 minutes (900 seconds)
  const expiresIn = 900;
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

  return {
    uploadUrl,
    key,
    fileId,
    bucket: bucketName,
    expiresIn,
  };
}

/**
 * Generate a pre-signed S3 download/view URL for a private receipt.
 *
 * @param {string} key - S3 object key
 * @param {number} [expiresIn=3600] - Expiration in seconds
 * @returns {Promise<string>} Pre-signed download URL
 */
async function generateReceiptViewUrl(key, expiresIn = 3600) {
  if (!key) return null;

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Fetch an object directly from S3 as a Buffer (for Gemini fallback processing).
 *
 * @param {string} key - S3 object key
 * @param {string} [bucket] - Bucket name (optional, defaults to configured bucketName)
 * @returns {Promise<Buffer>}
 */
async function getReceiptObjectBuffer(key, bucket = null) {
  const targetBucket = bucket || bucketName;
  const command = new GetObjectCommand({
    Bucket: targetBucket,
    Key: key,
  });

  const response = await s3Client.send(command);
  const stream = response.Body;
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Generate a pre-signed S3 upload URL for direct user avatar / profile photo upload.
 *
 * @param {string} userId - ID of the user uploading the avatar
 * @param {string} contentType - MIME type (image/jpeg, image/png, image/webp)
 * @returns {Promise<{ uploadUrl: string, key: string, bucket: string, expiresIn: number }>}
 */
async function generateAvatarUploadUrl(userId, contentType = 'image/jpeg') {
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const key = `avatars/${userId}/avatar.${ext}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const expiresIn = 900;
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

  return {
    uploadUrl,
    key,
    bucket: bucketName,
    expiresIn,
  };
}

/**
 * Generate a pre-signed S3 download/view URL for an avatar.
 * Valid for 24 hours.
 */
async function generateAvatarViewUrl(key) {
  if (!key) return null;
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 86400 });
}

/**
 * Persist authentication audit events (login/registration) directly to AWS S3.
 * Stored under audit-logs/YYYY-MM/userId-timestamp.json
 *
 * @param {object} param0
 * @param {'REGISTER'|'LOGIN'} param0.event
 * @param {string} param0.userId
 * @param {string} param0.email
 * @param {string} [param0.ip]
 * @param {string} [param0.userAgent]
 */
async function recordAuthAuditLogToS3({ event, userId, email, ip, userAgent }) {
  if (process.env.NODE_ENV === 'test') {
    return { success: true, key: 'mock-test-audit-key' };
  }
  try {
    const now = new Date();
    const yearMonth = now.toISOString().slice(0, 7);
    const key = `audit-logs/${yearMonth}/${userId}-${Date.now()}.json`;

    const payload = {
      event,
      userId: userId?.toString(),
      email,
      timestamp: now.toISOString(),
      ip: ip || 'unknown',
      userAgent: userAgent || 'unknown',
    };

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: 'application/json',
    });

    await s3Client.send(command);
    return { success: true, key };
  } catch (err) {
    console.warn(`[AWS S3] Could not record auth audit log for ${email}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  s3Client,
  bucketName,
  generateReceiptUploadUrl,
  generateReceiptViewUrl,
  getReceiptObjectBuffer,
  generateAvatarUploadUrl,
  generateAvatarViewUrl,
  recordAuthAuditLogToS3,
};
