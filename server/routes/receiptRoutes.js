const express = require('express');
const mongoose = require('mongoose');
const { generateReceiptUploadUrl, generateReceiptViewUrl, bucketName } = require('../services/s3Service');
const { analyzeReceiptExpense } = require('../services/textractService');
const Receipt = require('../models/Receipt');
const SplitGroup = require('../models/SplitGroup');
const { logger } = require('../utils/logger');

const router = express.Router();

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
  'image/heic',
  'image/heif',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB AWS Textract sync limit

/**
 * POST /api/receipts/upload-url
 * Validates file type and size, scopes to user and trip, records Receipt document,
 * and returns pre-signed S3 PUT URL.
 */
router.post('/upload-url', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { contentType = 'image/jpeg', fileSize, tripId } = req.body;

    const normalizedMime = (contentType || '').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
      return res.status(400).json({
        success: false,
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Unsupported document format. Allowed types: JPEG, PNG, PDF, and HEIC.',
      });
    }

    if (fileSize && Number(fileSize) > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        code: 'FILE_TOO_LARGE',
        message: 'File size exceeds the 10MB limit for AWS Textract.',
      });
    }

    // If tripId is provided, verify user is a member or owner of the trip
    if (tripId) {
      if (!mongoose.Types.ObjectId.isValid(tripId)) {
        return res.status(400).json({ success: false, message: 'Invalid tripId' });
      }

      const trip = await SplitGroup.findById(tripId);
      if (!trip) {
        return res.status(404).json({ success: false, message: 'Trip/Group not found' });
      }

      const isOwner = trip.userId.toString() === userId.toString();
      const isMember = trip.members?.some(
        (m) => m.userId && m.userId.toString() === userId.toString()
      );

      if (!isOwner && !isMember) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not a member of this trip.',
        });
      }
    }

    const receipt = new Receipt({
      userId,
      tripId: tripId || null,
      s3Key: 'pending',
      s3Bucket: bucketName,
      mimeType: normalizedMime,
      fileSize: fileSize ? Number(fileSize) : undefined,
      status: 'pending',
    });

    const uploadInfo = await generateReceiptUploadUrl(userId, normalizedMime, receipt._id.toString());
    receipt.s3Key = uploadInfo.key;
    await receipt.save();

    return res.status(201).json({
      success: true,
      receiptId: receipt._id,
      uploadUrl: uploadInfo.uploadUrl,
      key: uploadInfo.key,
      bucket: uploadInfo.bucket,
      expiresIn: uploadInfo.expiresIn,
      data: {
        receiptId: receipt._id,
        uploadUrl: uploadInfo.uploadUrl,
        key: uploadInfo.key,
        bucket: uploadInfo.bucket,
        expiresIn: uploadInfo.expiresIn,
      },
    });
  } catch (err) {
    console.error('Error generating receipt upload URL:', err);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to generate presigned upload URL',
    });
  }
});

/**
 * GET /api/receipts/:id
 * Polls receipt processing status and returns parsed line items when completed.
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid receipt ID' });
    }

    const receipt = await Receipt.findById(id);
    if (!receipt) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }

    // Scoped access check: either owner of receipt or member of associated trip
    const isOwner = receipt.userId.toString() === userId.toString();
    let hasTripAccess = false;
    if (!isOwner && receipt.tripId) {
      const trip = await SplitGroup.findById(receipt.tripId);
      if (trip) {
        hasTripAccess =
          trip.userId.toString() === userId.toString() ||
          trip.members?.some((m) => m.userId && m.userId.toString() === userId.toString());
      }
    }

    if (!isOwner && !hasTripAccess) {
      return res.status(403).json({ success: false, message: 'Access denied to this receipt' });
    }

    let receiptUrl = null;
    if (receipt.status === 'completed' && receipt.s3Key) {
      try {
        receiptUrl = await generateReceiptViewUrl(receipt.s3Key);
      } catch (viewErr) {
        console.warn('Could not generate view URL for receipt:', viewErr.message);
      }
    }

    return res.json({
      success: true,
      data: {
        receiptId: receipt._id,
        status: receipt.status,
        result: receipt.result,
        error: receipt.error,
        receiptUrl,
        createdAt: receipt.createdAt,
        updatedAt: receipt.updatedAt,
      },
    });
  } catch (err) {
    console.error('Error getting receipt status:', err);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to retrieve receipt status',
    });
  }
});

/**
 * POST /api/receipts/presigned-url (Legacy compatible)
 */
router.post('/presigned-url', async (req, res) => {
  try {
    const { contentType = 'image/jpeg' } = req.body;
    const data = await generateReceiptUploadUrl(req.user.id, contentType);
    return res.json({
      success: true,
      directUpload: true,
      ...data,
      data,
    });
  } catch (err) {
    console.error('Error generating pre-signed S3 URL:', err);
    return res.status(500).json({ success: false, message: 'Could not generate upload URL' });
  }
});

/**
 * POST /api/receipts/analyze-s3
 */
router.post('/analyze-s3', async (req, res) => {
  try {
    const { key, receiptId } = req.body;
    if (!key) {
      return res.status(400).json({ success: false, message: 'S3 object key is required' });
    }

    const result = await analyzeReceiptExpense({ bucket: bucketName, key });
    const viewUrl = await generateReceiptViewUrl(key);

    // If an associated receiptId exists in MongoDB, update it synchronously as well
    if (receiptId && mongoose.Types.ObjectId.isValid(receiptId)) {
      await Receipt.findByIdAndUpdate(receiptId, {
        status: 'completed',
        result,
      });
    }

    return res.json({
      success: true,
      ...result,
      receiptUrl: viewUrl,
      s3Key: key,
      data: {
        ...result,
        receiptUrl: viewUrl,
        s3Key: key,
      },
    });
  } catch (err) {
    logger.error({ err, key: req.body?.key, receiptId: req.body?.receiptId }, 'Error analyzing S3 receipt');
    const status = err.statusCode || err.status || 500;
    return res.status(status).json({
      success: false,
      code: err.code || err.name || 'TEXTRACT_ERROR',
      message: err.message || 'Failed to analyze receipt from S3',
    });
  }
});

/**
 * GET /api/receipts/view-url?key=receipts/...
 */
router.get('/view-url', async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) {
      return res.status(400).json({ success: false, message: 'S3 key query parameter is required' });
    }

    const viewUrl = await generateReceiptViewUrl(key);
    return res.json({
      success: true,
      data: {
        viewUrl,
        key,
      },
    });
  } catch (err) {
    console.error('Error getting pre-signed view URL:', err);
    return res.status(500).json({ success: false, message: 'Could not generate view URL' });
  }
});

/**
 * GET /api/receipts/diagnose
 * Read-only health check for the receipt pipeline: config, Textract access and S3 access.
 * Returns booleans and error names only (no secrets). Disabled in production unless
 * RECEIPT_DIAGNOSTICS=true.
 */
router.get('/diagnose', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.RECEIPT_DIAGNOSTICS !== 'true') {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  const { TextractClient, AnalyzeExpenseCommand } = require('@aws-sdk/client-textract');
  const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
  const { mapTextractError } = require('../services/textractService');
  const region = process.env.AWS_REGION || 'ap-south-1';
  const checks = {
    config: {
      region,
      bucketConfigured: Boolean(bucketName),
      staticAwsKeysSet: Boolean(process.env.AWS_ACCESS_KEY_ID),
      geminiFallbackConfigured: Boolean(process.env.GEMINI_API_KEY),
      nodeEnv: process.env.NODE_ENV || 'development',
    },
  };
  // 1x1 transparent PNG: Textract should answer "bad document" (= reachable and authorized)
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  try {
    await new TextractClient({ region }).send(new AnalyzeExpenseCommand({ Document: { Bytes: tinyPng } }));
    checks.textract = { ok: true, detail: 'Textract reachable and authorized.' };
  } catch (err) {
    const reachable = ['BadDocumentException', 'UnsupportedDocumentException', 'InvalidParameterException'].includes(err.name);
    const mapped = mapTextractError(err);
    checks.textract = reachable
      ? { ok: true, detail: 'Textract reachable and authorized (rejected the 1x1 test image, as expected).' }
      : { ok: false, errorName: err.name, message: mapped.message, hint: mapped.hint };
  }
  if (bucketName) {
    try {
      await new S3Client({ region }).send(new HeadBucketCommand({ Bucket: bucketName }));
      checks.s3 = { ok: true, detail: 'Receipts bucket reachable.' };
    } catch (err) {
      checks.s3 = { ok: false, errorName: err.name, hint: 'Check the bucket name, region and s3:ListBucket/GetObject/PutObject on the instance role.' };
    }
  } else {
    checks.s3 = { ok: false, hint: 'No receipts bucket configured (AWS_RECEIPTS_BUCKET).' };
  }
  const ok = Boolean(checks.textract?.ok) && Boolean(checks.s3?.ok);
  return res.status(ok ? 200 : 503).json({ success: ok, checks });
});

module.exports = router;
