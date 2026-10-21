const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');

process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';
process.env.NODE_ENV = 'test';

const { authMiddleware } = require('../middleware/authMiddleware');
const budgetRoutes = require('../routes/budgetRoutes');
const transactionRoutes = require('../routes/transactionRoutes');

describe('Budgets API - Integration Tests (Supertest + In-Memory Mongo)', () => {
  let app;
  let authToken;
  const testUserId = '64f0a0000000000000000002';

  beforeAll(async () => {
    await connectTestDb();
    app = express();
    app.use(express.json());

    authToken = jwt.sign({ id: testUserId, email: 'budget@example.com' }, process.env.JWT_SECRET);
    app.use('/api/budgets', authMiddleware, budgetRoutes);
    app.use('/api/transactions', authMiddleware, transactionRoutes);
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('POST & GET /api/budgets', () => {
    test('creates a budget and calculates spent amount correctly', async () => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      // 1. Create budget of 5000 for Food & Dining
      const createRes = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'Food & Dining',
          limit: 5000,
          month: currentMonth,
          year: currentYear,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.limit).toBe(5000);

      // 2. Add confirmed expense of 1200
      await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'expense',
          category: 'Food & Dining',
          amount: 1200,
          date: new Date().toISOString(),
          status: 'confirmed',
        });

      // 3. Add a draft expense of 800 (should NOT count toward spent budget)
      await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'expense',
          category: 'Food & Dining',
          amount: 800,
          date: new Date().toISOString(),
          isDraft: true,
          status: 'draft',
        });

      // 4. Fetch budgets
      const listRes = await request(app)
        .get(`/api/budgets?month=${currentMonth}&year=${currentYear}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(1);
      expect(listRes.body.data[0].category).toBe('Food & Dining');
      expect(listRes.body.data[0].limit).toBe(5000);
      expect(listRes.body.data[0].spent).toBe(1200); // 1200 confirmed, 800 draft excluded!
    });

    test('upserts existing budget instead of creating duplicate for same category/month', async () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ category: 'Travel', limit: 3000, month, year });

      // Post again with updated limit
      const secondRes = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ category: 'Travel', limit: 4500, month, year });

      expect(secondRes.status).toBe(201);
      expect(secondRes.body.data.limit).toBe(4500);

      // Verify only 1 budget exists
      const listRes = await request(app)
        .get(`/api/budgets?month=${month}&year=${year}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(listRes.body.data.length).toBe(1);
      expect(listRes.body.data[0].limit).toBe(4500);
    });
  });

  describe('PUT & DELETE /api/budgets/:id', () => {
    test('updates budget limit and deletes budget', async () => {
      const createRes = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ category: 'Shopping', limit: 2000 });

      const budgetId = createRes.body.data._id;

      // Update
      const updateRes = await request(app)
        .put(`/api/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ limit: 3500 });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.limit).toBe(3500);

      // Delete
      const delRes = await request(app)
        .delete(`/api/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
    });
  });
});
