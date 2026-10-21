const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test_jwt_secret_key_12345';
process.env.NODE_ENV = 'test';

const { authMiddleware } = require('../middleware/authMiddleware');
const receiptRoutes = require('../routes/receiptRoutes');
const Receipt = require('../models/Receipt');

// Mock s3Service
jest.mock('../services/s3Service', () => ({
  bucketName: 'finsight-receipts-test',
  generateReceiptUploadUrl: jest.fn().mockImplementation((userId, contentType, fileId) => {
    return Promise.resolve({
      uploadUrl: `https://finsight-receipts-test.s3.ap-south-1.amazonaws.com/receipts/${userId}/${fileId}.jpg?signed=true`,
      key: `receipts/${userId}/${fileId}.jpg`,
      bucket: 'finsight-receipts-test',
      expiresIn: 900,
    });
  }),
  generateReceiptViewUrl: jest.fn().mockImplementation((key) => {
    return Promise.resolve(`https://finsight-receipts-test.s3.ap-south-1.amazonaws.com/${key}?signed=true`);
  }),
}));

describe('Receipt Async Pipeline Endpoints - Integration Tests', () => {
  let app;
  let authToken;
  const testUserId = new mongoose.Types.ObjectId().toString();

  beforeAll(() => {
    app = express();
    app.use(express.json());

    authToken = jwt.sign({ id: testUserId, email: 'test@finsight.local' }, process.env.JWT_SECRET);
    app.use('/api/receipts', authMiddleware, receiptRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/receipts/upload-url rejects unsupported MIME types like image/webp', async () => {
    const res = await request(app)
      .post('/api/receipts/upload-url')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ contentType: 'image/webp' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  test('POST /api/receipts/upload-url rejects files exceeding 10MB', async () => {
    const res = await request(app)
      .post('/api/receipts/upload-url')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ contentType: 'image/jpeg', fileSize: 12 * 1024 * 1024 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  test('POST /api/receipts/upload-url succeeds for JPEG and returns signed uploadUrl and receiptId', async () => {
    // Mock Receipt.prototype.save
    const saveSpy = jest.spyOn(Receipt.prototype, 'save').mockResolvedValue(true);

    const res = await request(app)
      .post('/api/receipts/upload-url')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ contentType: 'image/jpeg', fileSize: 1024 * 500 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.receiptId).toBeDefined();
    expect(res.body.uploadUrl).toContain('https://finsight-receipts-test.s3.ap-south-1.amazonaws.com');
    expect(res.body.key).toContain(`receipts/${testUserId}/`);

    saveSpy.mockRestore();
  });

  test('GET /api/receipts/:id returns 400 for invalid mongo ObjectId', async () => {
    const res = await request(app)
      .get('/api/receipts/invalid-id-string')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/receipts/:id returns 404 for non-existent receipt', async () => {
    const randomId = new mongoose.Types.ObjectId().toString();
    jest.spyOn(Receipt, 'findById').mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/receipts/${randomId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/receipts/:id returns 200 with result when completed', async () => {
    const mockReceiptId = new mongoose.Types.ObjectId();
    const mockReceipt = {
      _id: mockReceiptId,
      userId: new mongoose.Types.ObjectId(testUserId),
      status: 'completed',
      s3Key: `receipts/${testUserId}/${mockReceiptId}.jpg`,
      result: {
        vendor: 'Starbucks Indiranagar',
        date: '2026-10-14',
        items: [
          { name: 'Caffè Mocha', quantity: 1, price: 345, lowConfidence: false },
          { name: 'Blueberry Muffin', quantity: 1, price: 220, lowConfidence: false },
        ],
        subtotal: 565,
        tax: 28.25,
        total: 593.25,
      },
    };

    jest.spyOn(Receipt, 'findById').mockResolvedValue(mockReceipt);

    const res = await request(app)
      .get(`/api/receipts/${mockReceiptId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.result.vendor).toBe('Starbucks Indiranagar');
    expect(res.body.data.result.items.length).toBe(2);
    expect(res.body.data.receiptUrl).toBeDefined();
  });
});
