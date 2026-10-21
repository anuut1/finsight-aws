const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');

process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';
process.env.NODE_ENV = 'test';

const { authMiddleware } = require('../middleware/authMiddleware');
const transactionRoutes = require('../routes/transactionRoutes');

describe('Transactions API - Integration Tests (Supertest + In-Memory Mongo)', () => {
  let app;
  let authToken;
  const testUserId = '64f0a0000000000000000001';

  beforeAll(async () => {
    await connectTestDb();
    app = express();
    app.use(express.json());

    authToken = jwt.sign({ id: testUserId, email: 'tester@example.com' }, process.env.JWT_SECRET);
    app.use('/api/transactions', authMiddleware, transactionRoutes);
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('POST /api/transactions', () => {
    test('creates a valid expense transaction', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'expense',
          category: 'Food & Dining',
          amount: 450,
          date: '2026-03-15',
          description: 'Lunch at Cafe',
          mood: 'happy',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amount).toBe(450);
      expect(res.body.data.category).toBe('Food & Dining');
      expect(res.body.data.status).toBe('confirmed');
    });

    test('creates an income transaction', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'income',
          category: 'Salary',
          amount: 75000,
          date: '2026-03-01',
          description: 'Monthly Salary',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('income');
      expect(res.body.data.amount).toBe(75000);
    });

    test('rejects negative or zero amount (HTTP 400)', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'expense',
          category: 'Groceries',
          amount: -100,
          date: '2026-03-15',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/positive number/i);
    });

    test('rejects missing required fields (HTTP 400)', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'expense',
          // missing category, amount, date
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/transactions', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'expense',
          category: 'Food & Dining',
          amount: 300,
          date: '2026-03-10',
          description: 'Pizza',
        });

      await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'income',
          category: 'Freelance',
          amount: 5000,
          date: '2026-03-12',
          description: 'Website Gig',
        });
    });

    test('lists all transactions with pagination metadata', async () => {
      const res = await request(app)
        .get('/api/transactions?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.pagination.total).toBe(2);
    });

    test('filters transactions by type (expense)', async () => {
      const res = await request(app)
        .get('/api/transactions?type=expense')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].category).toBe('Food & Dining');
    });

    test('filters transactions by category', async () => {
      const res = await request(app)
        .get('/api/transactions?category=Freelance')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].amount).toBe(5000);
    });
  });

  describe('PUT & DELETE /api/transactions/:id', () => {
    let createdTxId;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'expense',
          category: 'Shopping',
          amount: 1200,
          date: '2026-03-15',
          description: 'Shoes',
        });
      createdTxId = createRes.body.data._id;
    });

    test('updates an existing transaction', async () => {
      const res = await request(app)
        .put(`/api/transactions/${createdTxId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1500,
          description: 'Running Shoes',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amount).toBe(1500);
      expect(res.body.data.description).toBe('Running Shoes');
    });

    test('deletes an existing transaction', async () => {
      const delRes = await request(app)
        .delete(`/api/transactions/${createdTxId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify it no longer exists
      const listRes = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listRes.body.data.items.length).toBe(0);
    });
  });

  describe('POST /api/transactions/quick-add/parse', () => {
    test('parses natural language expense description heuristic accurately', async () => {
      const res = await request(app)
        .post('/api/transactions/quick-add/parse')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Spent 350 on pizza at Dominoes yesterday',
          currentDate: '2026-03-15',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amount).toBe(350);
      expect(res.body.data.category).toBe('Food & Dining');
      expect(res.body.data.date).toBe('2026-03-14'); // yesterday relative to 2026-03-15
    });

    test('rejects empty input text with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/quick-add/parse')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: '   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
