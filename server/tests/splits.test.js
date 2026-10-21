const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');

process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';
process.env.NODE_ENV = 'test';

const { authMiddleware } = require('../middleware/authMiddleware');
const splitRoutes = require('../routes/splitRoutes');

describe('Splits & Trips API - Integration Tests (Supertest + In-Memory Mongo)', () => {
  let app;
  let authToken;
  const testUserId = '64f0a0000000000000000004';

  beforeAll(async () => {
    await connectTestDb();
    app = express();
    app.use(express.json());

    authToken = jwt.sign({ id: testUserId, email: 'splits@example.com' }, process.env.JWT_SECRET);
    app.use('/api/splits', authMiddleware, splitRoutes);
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test('creates split group with members and computes balances & debt simplification', async () => {
    // 1. Create group with 3 members: Alice, Bob, Charlie
    const groupRes = await request(app)
      .post('/api/splits/groups')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Apartment Roommates',
        members: [
          { name: 'Alice', email: 'alice@example.com' },
          { name: 'Bob', email: 'bob@example.com' },
          { name: 'Charlie', email: 'charlie@example.com' },
        ],
      });

    expect(groupRes.status).toBe(201);
    expect(groupRes.body.success).toBe(true);
    const group = groupRes.body.data;
    const groupId = group._id;
    expect(group.members.length).toBe(3);

    const [alice, bob, charlie] = group.members;

    // 2. Alice pays 300 for groceries, split between Alice, Bob, Charlie (100 each)
    const expRes = await request(app)
      .post(`/api/splits/groups/${groupId}/expenses`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        description: 'Weekly Groceries',
        amount: 300,
        paidBy: alice._id,
        splitBetween: [alice._id, bob._id, charlie._id],
        date: '2026-03-15',
        category: 'Groceries',
        syncPersonal: false,
      });

    expect(expRes.status).toBe(201);
    const updatedGroup = expRes.body.data;

    // Alice paid 300, owes 100 -> net balance +200
    // Bob owes 100 -> net balance -100
    // Charlie owes 100 -> net balance -100
    const aliceBal = updatedGroup.memberBalances.find((m) => m.memberId === alice._id.toString());
    const bobBal = updatedGroup.memberBalances.find((m) => m.memberId === bob._id.toString());
    const charlieBal = updatedGroup.memberBalances.find((m) => m.memberId === charlie._id.toString());

    expect(aliceBal.balance).toBe(200);
    expect(bobBal.balance).toBe(-100);
    expect(charlieBal.balance).toBe(-100);

    // Simplified debts: Bob owes Alice 100, Charlie owes Alice 100
    expect(updatedGroup.simplifiedDebts.length).toBe(2);

    // 3. Bob settles 100 to Alice
    const settleRes = await request(app)
      .post(`/api/splits/groups/${groupId}/settlements`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        from: bob._id,
        to: alice._id,
        amount: 100,
        date: '2026-03-16',
        note: 'UPI Payment',
      });

    expect(settleRes.status).toBe(201);
    const afterSettle = settleRes.body.data;
    const bobBalAfter = afterSettle.memberBalances.find((m) => m.memberId === bob._id.toString());
    expect(bobBalAfter.balance).toBe(0); // Bob fully settled!
  });

  test('trip mode lifecycle: start trip, add expense, check active, end trip, get summary', async () => {
    // 1. Start trip
    const startRes = await request(app)
      .post('/api/splits/trips/start')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Manali 2026',
        members: [{ name: 'Alex' }, { name: 'Dev' }],
        currency: 'INR',
      });

    expect(startRes.status).toBe(201);
    expect(startRes.body.data.isTrip).toBe(true);
    expect(startRes.body.data.tripStatus).toBe('active');
    const tripId = startRes.body.data._id;

    // 2. Query active trip
    const activeRes = await request(app)
      .get('/api/splits/trips/active')
      .set('Authorization', `Bearer ${authToken}`);

    expect(activeRes.status).toBe(200);
    expect(activeRes.body.data._id).toBe(tripId);

    // 3. Add expense to trip
    const memberIds = startRes.body.data.members.map((m) => m._id);
    await request(app)
      .post(`/api/splits/groups/${tripId}/expenses`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        description: 'Cabin booking',
        amount: 4000,
        paidBy: memberIds[0],
        splitBetween: memberIds,
        date: '2026-03-20',
        syncPersonal: false,
      });

    // 4. End trip
    const endRes = await request(app)
      .post(`/api/splits/trips/${tripId}/end`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(endRes.status).toBe(200);
    expect(endRes.body.data.tripStatus).toBe('ended');

    // 5. Query trip summary
    const summaryRes = await request(app)
      .get(`/api/splits/trips/${tripId}/summary`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.tripSummary.totalSpend).toBe(4000);
    expect(summaryRes.body.data.tripSummary.perPersonFairShare).toBe(2000);
  });
});
