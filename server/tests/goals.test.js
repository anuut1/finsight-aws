const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');

process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';
process.env.NODE_ENV = 'test';

const { authMiddleware } = require('../middleware/authMiddleware');
const goalRoutes = require('../routes/goalRoutes');

describe('Goals API - Integration Tests (Supertest + In-Memory Mongo)', () => {
  let app;
  let authToken;
  const testUserId = '64f0a0000000000000000003';

  beforeAll(async () => {
    await connectTestDb();
    app = express();
    app.use(express.json());

    authToken = jwt.sign({ id: testUserId, email: 'goals@example.com' }, process.env.JWT_SECRET);
    app.use('/api/goals', authMiddleware, goalRoutes);
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test('creates a goal and lists it', async () => {
    const res = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Emergency Fund',
        targetAmount: 50000,
        savedAmount: 10000,
        deadline: '2026-12-31',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Emergency Fund');
    expect(res.body.data.targetAmount).toBe(50000);
    expect(res.body.data.status).toBe('active');

    const listRes = await request(app)
      .get('/api/goals')
      .set('Authorization', `Bearer ${authToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
  });

  test('updates goal and auto-completes when savings reach target', async () => {
    const createRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'New Laptop',
        targetAmount: 80000,
        savedAmount: 40000,
        deadline: '2026-08-01',
      });

    const goalId = createRes.body.data._id;
    expect(createRes.body.data.status).toBe('active');

    // Deposit remaining 40000
    const updateRes = await request(app)
      .put(`/api/goals/${goalId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        savedAmount: 80000,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.savedAmount).toBe(80000);
    expect(updateRes.body.data.status).toBe('completed');
  });

  test('deletes an existing goal', async () => {
    const createRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Goa Trip',
        targetAmount: 15000,
        deadline: '2026-07-01',
      });

    const goalId = createRes.body.data._id;

    const delRes = await request(app)
      .delete(`/api/goals/${goalId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const listRes = await request(app)
      .get('/api/goals')
      .set('Authorization', `Bearer ${authToken}`);

    expect(listRes.body.data.length).toBe(0);
  });
});
