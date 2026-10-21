const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');

process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';
process.env.NODE_ENV = 'test';

const { authMiddleware } = require('../middleware/authMiddleware');
const splitRoutes = require('../routes/splitRoutes');
const SplitGroup = require('../models/SplitGroup');
const UpiDraft = require('../models/UpiDraft');

// Mock s3Service
jest.mock('../services/s3Service', () => ({
  generateReceiptViewUrl: jest.fn(async (key, expiresIn) => {
    return `https://mock-bucket.s3.amazonaws.com/${key}?signed=true&expires=${expiresIn || 3600}`;
  }),
}));

describe('Split Group Receipt Storage & Access API', () => {
  let app;
  let ownerToken;
  let memberToken;
  let strangerToken;

  const ownerId = '64f0a0000000000000000001';
  const memberId = '64f0a0000000000000000002';
  const strangerId = '64f0a0000000000000000099';

  beforeAll(async () => {
    await connectTestDb();
    app = express();
    app.use(express.json());

    ownerToken = jwt.sign({ id: ownerId, email: 'owner@example.com' }, process.env.JWT_SECRET);
    memberToken = jwt.sign({ id: memberId, email: 'member@example.com' }, process.env.JWT_SECRET);
    strangerToken = jwt.sign({ id: strangerId, email: 'stranger@example.com' }, process.env.JWT_SECRET);

    app.use('/api/splits', authMiddleware, splitRoutes);
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test('stores receiptKey on expense and allows active members to retrieve presigned URL', async () => {
    // 1. Create a trip group with owner and member
    const groupRes = await request(app)
      .post('/api/splits/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Goa Trip',
        members: [
          { name: 'Owner', userId: ownerId },
          { name: 'Member', userId: memberId },
        ],
      });

    expect(groupRes.status).toBe(201);
    const group = groupRes.body.data;
    const groupId = group._id;
    const [ownerMember, otherMember] = group.members;

    const receiptKey = `receipts/${ownerId}/sample-receipt-123.jpg`;

    // 2. Add expense with receiptKey
    const expRes = await request(app)
      .post(`/api/splits/groups/${groupId}/expenses`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        description: 'Cafe Dinner',
        amount: 850,
        paidBy: ownerMember._id,
        splitBetween: [ownerMember._id, otherMember._id],
        date: '2026-03-25',
        receiptKey,
      });

    expect(expRes.status).toBe(201);

    // Verify stored on DB document
    const updatedGroup = await SplitGroup.findById(groupId);
    expect(updatedGroup.expenses[0].receiptKey).toBe(receiptKey);
    expect(updatedGroup.expenses[0].receiptUploadedAt).toBeDefined();

    // 3. Active member requests receipt URL -> 200 OK
    const memberUrlRes = await request(app)
      .get(`/api/splits/groups/${groupId}/receipts/${encodeURIComponent(receiptKey)}/url`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(memberUrlRes.status).toBe(200);
    expect(memberUrlRes.body.success).toBe(true);
    expect(memberUrlRes.body.data.url).toContain(receiptKey);
    expect(memberUrlRes.body.data.notice).toBe('Receipt available for 30 days');

    // 4. Stranger requests receipt URL -> 404 (always 404 to avoid leaking existence)
    const strangerUrlRes = await request(app)
      .get(`/api/splits/groups/${groupId}/receipts/${encodeURIComponent(receiptKey)}/url`)
      .set('Authorization', `Bearer ${strangerToken}`);

    expect(strangerUrlRes.status).toBe(404);
  });

  test('rejects path traversal and invalid extensions', async () => {
    const groupRes = await request(app)
      .post('/api/splits/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Roadtrip',
        members: [
          { name: 'Owner', userId: ownerId },
          { name: 'Member', userId: memberId },
        ],
      });

    const groupId = groupRes.body.data._id;

    // Path traversal attempt
    const traversalRes = await request(app)
      .get(`/api/splits/groups/${groupId}/receipts/${encodeURIComponent('../../../etc/passwd.jpg')}/url`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(traversalRes.status).toBe(400);
    expect(traversalRes.body.message).toMatch(/invalid receipt key path/i);

    // Invalid extension attempt
    const invalidExtRes = await request(app)
      .get(`/api/splits/groups/${groupId}/receipts/${encodeURIComponent('receipts/user/script.exe')}/url`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(invalidExtRes.status).toBe(400);
    expect(invalidExtRes.body.message).toMatch(/invalid receipt file type/i);
  });

  test('stores receiptKey on upi-draft and carries it to expense when poll closes', async () => {
    const groupRes = await request(app)
      .post('/api/splits/trips/start')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Weekend Getaway',
        members: [
          { name: 'Owner', userId: ownerId },
          { name: 'Member', userId: memberId },
        ],
      });

    const groupId = groupRes.body.data._id;
    const [m1, m2] = groupRes.body.data.members;

    const receiptKey = `receipts/${ownerId}/poll-receipt-456.png`;

    // 1. Create UPI Draft with receiptKey
    const draftRes = await request(app)
      .post(`/api/splits/groups/${groupId}/upi-drafts`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        amount: 500,
        merchant: 'Beach Bar',
        receiptKey,
      });

    expect(draftRes.status).toBe(201);
    expect(draftRes.body.data.receiptKey).toBe(receiptKey);
    const draftId = draftRes.body.data._id;

    // 2. Assign as Poll
    await request(app)
      .post(`/api/splits/groups/${groupId}/upi-drafts/${draftId}/assign`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        mode: 'poll',
        paidBy: m1._id,
        question: 'Did you have drinks at Beach Bar?',
      });

    // 3. Member responds opt-in
    await request(app)
      .post(`/api/splits/groups/${groupId}/upi-drafts/${draftId}/poll/respond`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        status: 'opted_in',
      });

    // 4. Close poll
    const closeRes = await request(app)
      .post(`/api/splits/groups/${groupId}/upi-drafts/${draftId}/poll/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.expense.receiptKey).toBe(receiptKey);
    expect(closeRes.body.data.expense.receiptUploadedAt).toBeDefined();

    // 5. Member accesses the receipt from the closed poll expense
    const viewRes = await request(app)
      .get(`/api/splits/groups/${groupId}/receipts/${encodeURIComponent(receiptKey)}/url`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(viewRes.status).toBe(200);
    expect(viewRes.body.data.url).toContain(receiptKey);
  });
});
