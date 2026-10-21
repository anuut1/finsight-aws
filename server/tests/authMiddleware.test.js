const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_jwt_secret_auth_middleware_12345';
process.env.REMINDER_SECRET_KEY = 'reminder_secret_test_xyz';
process.env.NODE_ENV = 'test';

const { authMiddleware } = require('../middleware/authMiddleware');

describe('Auth Middleware - Unit & Security Tests', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Protected dummy endpoint
    app.get('/api/protected', authMiddleware, (req, res) => {
      res.json({ success: true, userId: req.user.id });
    });

    // Magic approve route
    app.get('/api/transactions/drafts/magic-approve', authMiddleware, (req, res) => {
      res.json({ success: true, route: 'magic-approve' });
    });

    // EOD trigger route
    app.post('/api/transactions/drafts/eod-trigger', authMiddleware, (req, res) => {
      res.json({ success: true, isCronTrigger: Boolean(req.isCronTrigger) });
    });
  });

  test('rejects request with missing Authorization header (401)', async () => {
    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/No token provided/i);
  });

  test('rejects request with malformed Authorization header (no Bearer prefix) (401)', async () => {
    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', 'Basic 123456');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('rejects request with invalid or tampered token (401)', async () => {
    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', 'Bearer invalid.tampered.token');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid token/i);
  });

  test('rejects request with expired token (401)', async () => {
    // Generate token that expired 1 hour ago
    const expiredToken = jwt.sign(
      { id: 'user123', exp: Math.floor(Date.now() / 1000) - 3600 },
      process.env.JWT_SECRET
    );

    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('passes request with valid Bearer token', async () => {
    const validToken = jwt.sign({ id: 'user_valid_999' }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.userId).toBe('user_valid_999');
  });

  test('allows magic approve route to bypass without Authorization header', async () => {
    const res = await request(app).get('/api/transactions/drafts/magic-approve');
    expect(res.status).toBe(200);
    expect(res.body.route).toBe('magic-approve');
  });

  test('allows EOD trigger with valid x-reminder-secret header to bypass without Authorization header', async () => {
    const res = await request(app)
      .post('/api/transactions/drafts/eod-trigger')
      .set('x-reminder-secret', 'reminder_secret_test_xyz');

    expect(res.status).toBe(200);
    expect(res.body.isCronTrigger).toBe(true);
  });
});
