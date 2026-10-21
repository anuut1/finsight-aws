const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');

process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';
process.env.NODE_ENV = 'test';

const { authMiddleware } = require('../middleware/authMiddleware');
const splitRoutes = require('../routes/splitRoutes');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

describe('Phase 5: Settle-Up Flow & Full End-to-End Integration Tests', () => {
  let app;
  let user1, user2, user3, user4;
  let token1, token2, token3, token4;

  beforeAll(async () => {
    await connectTestDb();
    app = express();
    app.use(express.json());
    app.use('/api/splits', authMiddleware, splitRoutes);
  });

  beforeEach(async () => {
    await clearTestDb();

    // Create 4 test users
    user1 = await User.create({ name: 'Alice Host', email: 'alice.host@example.com', password: 'password123' });
    user2 = await User.create({ name: 'Bob Traveler', email: 'bob.traveler@example.com', password: 'password123' });
    user3 = await User.create({ name: 'Charlie Friend', email: 'charlie.friend@example.com', password: 'password123' });
    user4 = await User.create({ name: 'Dave Outsider', email: 'dave.outsider@example.com', password: 'password123' });

    token1 = jwt.sign({ id: user1._id.toString(), email: user1.email }, process.env.JWT_SECRET);
    token2 = jwt.sign({ id: user2._id.toString(), email: user2.email }, process.env.JWT_SECRET);
    token3 = jwt.sign({ id: user3._id.toString(), email: user3.email }, process.env.JWT_SECRET);
    token4 = jwt.sign({ id: user4._id.toString(), email: user4.email }, process.env.JWT_SECRET);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test('simplifies complex circular debt cycles and uneven remainder paise splits', async () => {
    // 1. Alice creates trip with Bob and Charlie
    const createRes = await request(app)
      .post('/api/splits/trips/start')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'Circular Debt Test Trip',
        members: [
          { name: 'Alice Host', email: user1.email, userId: user1._id.toString() },
          { name: 'Bob Traveler', email: user2.email, userId: user2._id.toString() },
          { name: 'Charlie Friend', email: user3.email, userId: user3._id.toString() },
        ],
      });

    expect(createRes.status).toBe(201);
    const trip = createRes.body.data;
    const tripId = trip._id;
    const [mAlice, mBob, mCharlie] = trip.members;

    // 2. Circular expenses:
    // Alice pays 150 for Bob
    await request(app)
      .post(`/api/splits/groups/${tripId}/expenses`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        description: 'Alice paid for Bob',
        amount: 150,
        paidBy: mAlice._id,
        splitBetween: [mBob._id],
        date: '2026-10-17',
        syncPersonal: false,
      });

    // Bob pays 150 for Charlie
    await request(app)
      .post(`/api/splits/groups/${tripId}/expenses`)
      .set('Authorization', `Bearer ${token2}`)
      .send({
        description: 'Bob paid for Charlie',
        amount: 150,
        paidBy: mBob._id,
        splitBetween: [mCharlie._id],
        date: '2026-10-17',
        syncPersonal: false,
      });

    // Charlie pays 150 for Alice
    const charlieExpRes = await request(app)
      .post(`/api/splits/groups/${tripId}/expenses`)
      .set('Authorization', `Bearer ${token3}`)
      .send({
        description: 'Charlie paid for Alice',
        amount: 150,
        paidBy: mCharlie._id,
        splitBetween: [mAlice._id],
        date: '2026-10-17',
        syncPersonal: false,
      });

    expect(charlieExpRes.status).toBe(201);
    const circularSummary = charlieExpRes.body.data;

    // All circular debts must cancel out completely
    expect(circularSummary.memberBalances.find((m) => m.memberId === mAlice._id).balance).toBe(0);
    expect(circularSummary.memberBalances.find((m) => m.memberId === mBob._id).balance).toBe(0);
    expect(circularSummary.memberBalances.find((m) => m.memberId === mCharlie._id).balance).toBe(0);
    expect(circularSummary.simplifiedDebts.length).toBe(0); // 0 simplified debts!

    // 3. Now add an uneven remainder paise split: Alice pays ₹100 for all 3 members (Alice, Bob, Charlie)
    // 10000 paise / 3 = 3333 base paise with 1 remainder paise -> mAlice: 33.34, mBob: 33.33, mCharlie: 33.33
    const unevenExpRes = await request(app)
      .post(`/api/splits/groups/${tripId}/expenses`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        description: 'Uneven Chai Snack',
        amount: 100,
        paidBy: mAlice._id,
        splitBetween: [mAlice._id, mBob._id, mCharlie._id],
        date: '2026-10-17',
        syncPersonal: false,
      });

    const unevenData = unevenExpRes.body.data;
    const aBal = unevenData.memberBalances.find((m) => m.memberId === mAlice._id).balance;
    const bBal = unevenData.memberBalances.find((m) => m.memberId === mBob._id).balance;
    const cBal = unevenData.memberBalances.find((m) => m.memberId === mCharlie._id).balance;

    expect(aBal).toBe(66.66); // Paid 100, share 33.34 -> net +66.66
    expect(bBal).toBe(-33.33);
    expect(cBal).toBe(-33.33);

    // Sum of all balances is strictly 0: 66.66 + (-33.33) + (-33.33) = 0
    expect(Math.round((aBal + bBal + cBal) * 100)).toBe(0);

    // Simplified debts: Bob owes Alice 33.33, Charlie owes Alice 33.33
    expect(unevenData.simplifiedDebts).toHaveLength(2);
    const totalSimplifiedDebt = unevenData.simplifiedDebts.reduce((sum, d) => sum + d.amount, 0);
    expect(totalSimplifiedDebt).toBe(66.66);
  });

  test('complete full-lifecycle: friend invite -> payment draft -> opt-in poll -> settle up via UPI -> balance zero', async () => {
    // Step 1: Alice creates trip with Bob
    const tripRes = await request(app)
      .post('/api/splits/trips/start')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'Goa Coastal Getaway',
        members: [
          { name: 'Alice Host', email: user1.email, userId: user1._id.toString() },
          { name: 'Bob Traveler', email: user2.email, userId: user2._id.toString() },
        ],
      });

    expect(tripRes.status).toBe(201);
    const tripId = tripRes.body.data._id;
    const [mAlice, mBob] = tripRes.body.data.members;

    // Step 2: Alice captures a UPI QR payment draft (e.g. at Beach Shack for ₹1200)
    const draftRes = await request(app)
      .post(`/api/splits/groups/${tripId}/upi-drafts`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        amount: 1200,
        merchant: 'Sunset Shack & Bar',
        category: 'Food & Dining',
        payerVpa: 'sunsetshack@icici',
      });

    expect(draftRes.status).toBe(201);
    const draftId = draftRes.body.data._id;
    expect(draftRes.body.data.status).toBe('pending_assignment');

    // Step 3: Alice chooses "Ask Everyone" (starts an opt-in poll)
    const pollInitRes = await request(app)
      .post(`/api/splits/groups/${tripId}/upi-drafts/${draftId}/assign`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        mode: 'poll',
        paidBy: mAlice._id,
        question: 'Did you join for dinner at Sunset Shack & Bar (₹1200)?',
      });

    expect(pollInitRes.status).toBe(200);
    expect(pollInitRes.body.data.status).toBe('poll_created');

    // Step 4: Bob votes "opt_in" ("✓ I was part of this")
    const bobVoteRes = await request(app)
      .post(`/api/splits/groups/${tripId}/upi-drafts/${draftId}/poll/respond`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ response: 'opt_in' });

    expect(bobVoteRes.status).toBe(200);
    const bobOption = bobVoteRes.body.data.poll.options.find((o) => o.memberId === mBob._id);
    expect(bobOption.status).toBe('opted_in');

    // Step 5: Alice closes the poll -> integer-paise math converts it to expense with personal budget sync
    const pollCloseRes = await request(app)
      .post(`/api/splits/groups/${tripId}/upi-drafts/${draftId}/poll/close`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ syncPersonal: true });

    expect(pollCloseRes.status).toBe(200);
    expect(pollCloseRes.body.data.draft.status).toBe('assigned_to_expense');

    // Verify personal budget sync: Bob now has an isolated personal Transaction of ₹600
    const bobTx = await Transaction.findOne({ userId: user2._id, splitGroupId: tripId });
    expect(bobTx).not.toBeNull();
    expect(bobTx.amount).toBe(600);
    expect(bobTx.source).toBe('split');

    // Step 6: Verify Who-Owes-Whom before settlement: Bob owes Alice ₹600
    const summaryBeforeSettle = await request(app)
      .get(`/api/splits/trips/${tripId}/summary`)
      .set('Authorization', `Bearer ${token1}`);

    expect(summaryBeforeSettle.status).toBe(200);
    expect(summaryBeforeSettle.body.data.simplifiedDebts).toHaveLength(1);
    const debt = summaryBeforeSettle.body.data.simplifiedDebts[0];
    expect(debt.from).toBe(mBob._id);
    expect(debt.to).toBe(mAlice._id);
    expect(debt.amount).toBe(600);

    // Step 7: Access enforcement: Dave (non-member) cannot record a settlement for this trip
    const unauthorizedRes = await request(app)
      .post(`/api/splits/groups/${tripId}/settlements`)
      .set('Authorization', `Bearer ${token4}`)
      .send({
        from: mBob._id,
        to: mAlice._id,
        amount: 600,
        date: '2026-10-17',
      });
    expect([403, 404]).toContain(unauthorizedRes.status);

    // Step 8: Bob records settlement to Alice (after paying via UPI deep-link / QR code)
    const settleRes = await request(app)
      .post(`/api/splits/groups/${tripId}/settlements`)
      .set('Authorization', `Bearer ${token2}`)
      .send({
        from: mBob._id,
        to: mAlice._id,
        amount: 600,
        date: '2026-10-17',
        note: 'Settled via Google Pay UPI',
      });

    expect(settleRes.status).toBe(201);
    const settledGroup = settleRes.body.data;

    // Verify both balances are now 0 and simplifiedDebts is empty
    expect(settledGroup.memberBalances.find((m) => m.memberId === mAlice._id).balance).toBe(0);
    expect(settledGroup.memberBalances.find((m) => m.memberId === mBob._id).balance).toBe(0);
    expect(settledGroup.simplifiedDebts).toHaveLength(0); // "Everyone is completely settled!"

    // Step 9: Now that balances are 0, Bob can safely leave the group
    const leaveRes = await request(app)
      .post(`/api/splits/groups/${tripId}/leave`)
      .set('Authorization', `Bearer ${token2}`);

    expect(leaveRes.status).toBe(200);
    expect(leaveRes.body.success).toBe(true);
  });
});
