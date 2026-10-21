const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');

process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';
process.env.REMINDER_SECRET_KEY = 'test_reminder_secret_98765';
process.env.NODE_ENV = 'test';

const { authMiddleware } = require('../middleware/authMiddleware');
const transactionRoutes = require('../routes/transactionRoutes');
const { generateApprovalToken } = require('../services/eodReminderService');

describe('Drafts & EOD Reminders - Integration Tests', () => {
  let app;
  let authToken;
  const testUserId = '64f0a0000000000000000005';

  beforeAll(async () => {
    await connectTestDb();
    app = express();
    app.use(express.json());

    authToken = jwt.sign({ id: testUserId, email: 'drafts@example.com' }, process.env.JWT_SECRET);
    app.use('/api/transactions', authMiddleware, transactionRoutes);
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test('fetches unconfirmed drafts and approves/rejects them', async () => {
    // 1. Create two draft transactions
    const d1 = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'expense',
        category: 'Food & Dining',
        amount: 320,
        date: '2026-03-15',
        isDraft: true,
        status: 'draft',
      });

    const d2 = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'expense',
        category: 'Travel',
        amount: 180,
        date: '2026-03-15',
        isDraft: true,
        status: 'draft',
      });

    const draft1Id = d1.body.data._id;
    const draft2Id = d2.body.data._id;

    // 2. Fetch drafts
    const listRes = await request(app)
      .get('/api/transactions/drafts')
      .set('Authorization', `Bearer ${authToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.count).toBe(2);
    expect(listRes.body.totalAmount).toBe(500);

    // 3. Approve draft 1 with modifications
    const approveRes = await request(app)
      .patch(`/api/transactions/drafts/${draft1Id}/approve`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'Food & Dining',
        description: 'Confirmed lunch',
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('confirmed');

    // 4. Reject/dismiss draft 2
    const rejectRes = await request(app)
      .delete(`/api/transactions/drafts/${draft2Id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(rejectRes.status).toBe(200);

    // 5. Verify 0 drafts remain
    const emptyList = await request(app)
      .get('/api/transactions/drafts')
      .set('Authorization', `Bearer ${authToken}`);

    expect(emptyList.body.count).toBe(0);
  });

  test('approve-all drafts confirms all pending drafts at once', async () => {
    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'expense',
        category: 'Shopping',
        amount: 500,
        date: '2026-03-15',
        status: 'draft',
        isDraft: true,
      });

    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'expense',
        category: 'Groceries',
        amount: 800,
        date: '2026-03-15',
        status: 'draft',
        isDraft: true,
      });

    const approveAllRes = await request(app)
      .post('/api/transactions/drafts/approve-all')
      .set('Authorization', `Bearer ${authToken}`);

    expect(approveAllRes.status).toBe(200);
    expect(approveAllRes.body.modifiedCount).toBe(2);
  });

  test('one-tap magic approve endpoint approves drafts and redirects', async () => {
    const draftRes = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'expense',
        category: 'Entertainment',
        amount: 600,
        date: '2026-03-15',
        status: 'draft',
        isDraft: true,
      });

    const draftId = draftRes.body.data._id;
    const magicToken = generateApprovalToken(testUserId, [draftId]);

    const magicRes = await request(app).get(
      `/api/transactions/drafts/magic-approve?token=${encodeURIComponent(magicToken)}`
    );

    // Redirects to dashboard with drafts_approved=true
    expect(magicRes.status).toBe(302);
    expect(magicRes.headers.location).toMatch(/drafts_approved=true/);
  });

  test('EOD trigger accepts request with valid x-reminder-secret header', async () => {
    const triggerRes = await request(app)
      .post('/api/transactions/drafts/eod-trigger')
      .set('x-reminder-secret', 'test_reminder_secret_98765');

    expect(triggerRes.status).toBe(200);
    expect(triggerRes.body.success).toBe(true);
  });
});
