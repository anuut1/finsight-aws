const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_jwt_secret_key_12345';
process.env.NODE_ENV = 'test';

const { authMiddleware } = require('../middleware/authMiddleware');
const transactionRoutes = require('../routes/transactionRoutes');

describe('Receipt Scan Endpoint - Integration Tests', () => {
  let app;
  let authToken;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Generate auth token
    const testUserId = '64f0a0000000000000000001';
    authToken = jwt.sign({ id: testUserId, email: 'test@finsight.local' }, process.env.JWT_SECRET);

    // Mount transaction routes behind authMiddleware
    app.use('/api/transactions', authMiddleware, transactionRoutes);
  });

  test('returns 400 if no receipt file is uploaded', async () => {
    const res = await request(app)
      .post('/api/transactions/receipt/scan')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Please upload a receipt file/i);
  });

  test('returns 400 if unsupported file type (e.g. WebP) is uploaded', async () => {
    const res = await request(app)
      .post('/api/transactions/receipt/scan')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('receipt', Buffer.from('fake webp content'), {
        filename: 'receipt.webp',
        contentType: 'image/webp',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(res.body.message).toMatch(/WebP format is not supported/i);
  });

  test('returns 400 if unsupported file type (e.g. HEIC) is uploaded', async () => {
    const res = await request(app)
      .post('/api/transactions/receipt/scan')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('receipt', Buffer.from('fake heic content'), {
        filename: 'receipt.heic',
        contentType: 'image/heic',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(res.body.message).toMatch(/HEIC format from iPhones is not supported/i);
  });

  test('returns 400 if file exceeds 10MB limit', async () => {
    // 11MB buffer
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

    const res = await request(app)
      .post('/api/transactions/receipt/scan')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('receipt', largeBuffer, {
        filename: 'large-receipt.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  test('returns 200 and clean response shape when receipt is parsed successfully', async () => {
    // Set TEXTRACT_MOCK=true for testing the controller endpoint without live AWS credentials
    process.env.TEXTRACT_MOCK = 'true';

    const samplePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

    const res = await request(app)
      .post('/api/transactions/receipt/scan')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('receipt', samplePng, {
        filename: 'receipt.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data).toBeDefined();

    // Verify required shape:
    // { vendor, date, items: [{ name, quantity, price }], subtotal, tax, total, lowConfidenceItems: [] }
    expect(data).toHaveProperty('vendor');
    expect(data).toHaveProperty('date');
    expect(data).toHaveProperty('subtotal');
    expect(data).toHaveProperty('tax');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.items)).toBe(true);
    expect(Array.isArray(data.lowConfidenceItems)).toBe(true);

    expect(typeof data.subtotal).toBe('number');
    expect(typeof data.tax).toBe('number');
    expect(typeof data.total).toBe('number');

    expect(data.items.length).toBeGreaterThan(0);
    data.items.forEach((item) => {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('quantity');
      expect(item).toHaveProperty('price');
      expect(typeof item.quantity).toBe('number');
      expect(typeof item.price).toBe('number');
    });

    delete process.env.TEXTRACT_MOCK;
  });
});
