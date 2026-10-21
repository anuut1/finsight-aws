const request = require('supertest');
const express = require('express');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');

process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';
process.env.NODE_ENV = 'test';

const authRoutes = require('../routes/authRoutes');

describe('Auth API - Integration Tests (Supertest + In-Memory Mongo)', () => {
  let app;

  beforeAll(async () => {
    await connectTestDb();
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('POST /api/auth/register', () => {
    test('successfully registers a user with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('jane@example.com');
      expect(res.body.data.token).toBeDefined();
    });

    test('rejects registration with duplicate email (HTTP 400)', async () => {
      await request(app).post('/api/auth/register').send({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'password123',
      });

      const res = await request(app).post('/api/auth/register').send({
        name: 'Jane Duplicate',
        email: 'jane@example.com',
        password: 'password456',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already in use/i);
    });

    test('rejects weak password with fewer than 6 characters (HTTP 400)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Short Pass',
        email: 'short@example.com',
        password: '123',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/at least 6 characters/i);
    });

    test('rejects invalid email address format (HTTP 400)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Invalid Email',
        email: 'not-an-email',
        password: 'password123',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/valid email/i);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send({
        name: 'Login Tester',
        email: 'login@example.com',
        password: 'correctpassword',
      });
    });

    test('logs in successfully with valid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'login@example.com',
        password: 'correctpassword',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('login@example.com');
    });

    test('rejects login with wrong password (HTTP 400)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'login@example.com',
        password: 'wrongpassword',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid credentials/i);
    });

    test('rejects login with non-existent email (HTTP 400)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nobody@example.com',
        password: 'somepassword',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid credentials/i);
    });
  });

  describe('GET /api/auth/me', () => {
    test('returns user details when authenticated with valid Bearer token', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Auth Me Tester',
        email: 'me@example.com',
        password: 'password123',
      });

      const token = regRes.body.data.token;

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.email).toBe('me@example.com');
    });

    test('returns 401 when Authorization token is missing', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    test('resets user password and returns valid login token', async () => {
      await request(app).post('/api/auth/register').send({
        name: 'Reset Tester',
        email: 'reset@example.com',
        password: 'oldpassword123',
      });

      const resetRes = await request(app).post('/api/auth/reset-password').send({
        email: 'reset@example.com',
        newPassword: 'newpassword456',
      });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);

      // Verify login with new password works
      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'reset@example.com',
        password: 'newpassword456',
      });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
    });
  });
});
