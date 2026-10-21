const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');

process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';
process.env.NODE_ENV = 'test';

const { authMiddleware } = require('../middleware/authMiddleware');
const splitRoutes = require('../routes/splitRoutes');
const SplitGroup = require('../models/SplitGroup');
const Bill = require('../models/Bill');
const Transaction = require('../models/Transaction');

describe('Phase 5 - End-to-End Multi-Account Trip Receipts & Itemized Split Flow', () => {
  let app;
  let aliceToken;
  let bobToken;

  const aliceUserId = '64f0a0000000000000000001';
  const bobUserId = '64f0a0000000000000000002';

  beforeAll(async () => {
    await connectTestDb();
    app = express();
    app.use(express.json());

    aliceToken = jwt.sign({ id: aliceUserId, email: 'alice@example.com' }, process.env.JWT_SECRET);
    bobToken = jwt.sign({ id: bobUserId, email: 'bob@example.com' }, process.env.JWT_SECRET);

    app.use('/api/splits', authMiddleware, splitRoutes);
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test('E2E Journey: Attach receipt -> Review -> Publish -> Bob claims -> Finalize -> Settle up', async () => {
    // 1. Alice creates an active trip group with Bob
    const createTripRes = await request(app)
      .post('/api/splits/trips/start')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        name: 'Goa Holiday 2026',
        members: [
          { name: 'Alice', userId: aliceUserId, email: 'alice@example.com' },
          { name: 'Bob', userId: bobUserId, email: 'bob@example.com' },
        ],
        currency: 'INR',
      });

    expect(createTripRes.status).toBe(201);
    const trip = createTripRes.body.data;
    const aliceMemberId = trip.members.find((m) => m.userId === aliceUserId)._id;
    const bobMemberId = trip.members.find((m) => m.userId === bobUserId)._id;

    // 2. Alice scans receipt, reviews items, and publishes the itemized bill
    // Items: Fish Curry (₹500), Butter Naan 2x (₹200 total), Beers 2x (₹300 total), Tax (₹100) = ₹1100 Total
    const publishRes = await request(app)
      .post(`/api/splits/groups/${trip._id}/bills`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        title: 'Fishermans Wharf Shack',
        paidBy: aliceMemberId,
        receiptKey: 'receipts/trip1/fishermans-wharf.jpg',
        items: [
          { name: 'Fish Curry', qty: 1, price: 500 },
          { name: 'Butter Naan', qty: 2, price: 200 },
          { name: 'Beers', qty: 2, price: 300 },
        ],
        tax: 100,
        serviceCharge: 0,
        tip: 0,
        discount: 0,
        total: 1100,
        unclaimedPolicy: 'split_equally',
      });

    expect(publishRes.status).toBe(201);
    const bill = publishRes.body.data;
    expect(bill.status).toBe('claiming');
    expect(bill.receiptKey).toBe('receipts/trip1/fishermans-wharf.jpg');

    const fishCurryItem = bill.items.find((i) => i.name === 'Fish Curry');
    const butterNaanItem = bill.items.find((i) => i.name === 'Butter Naan');
    const beersItem = bill.items.find((i) => i.name === 'Beers');

    // 3. Bob logs in, inspects the bill, and claims Fish Curry (1 unit) and 1 Beer (1 unit)
    const bobClaimRes = await request(app)
      .post(`/api/splits/groups/${trip._id}/bills/${bill._id}/claim`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({
        claims: [
          { itemId: fishCurryItem._id, units: 1 },
          { itemId: beersItem._id, units: 1 },
        ],
      });

    expect(bobClaimRes.status).toBe(200);
    // Bob's items subtotal: 500 + 150 = 650
    // Unclaimed: 200 (naan) + 150 (1 beer) = 350 -> split equally: 175 each
    // Bob's effective subtotal = 650 + 175 = 825
    // Bob's proportional tax ratio = 825 / 1000 = 82.5% -> 83 paise/rupees
    const bobShare = bobClaimRes.body.data.myShare;
    expect(bobShare.itemsSubtotal).toBe(650);
    expect(bobShare.unclaimedShare).toBe(175);
    expect(bobShare.total).toBe(907.5);

    // 4. Alice claims the remaining 1 Beer and 2 Butter Naans
    const aliceClaimRes = await request(app)
      .post(`/api/splits/groups/${trip._id}/bills/${bill._id}/claim`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        claims: [
          { itemId: butterNaanItem._id, units: 2 },
          { itemId: beersItem._id, units: 1 },
        ],
      });

    expect(aliceClaimRes.status).toBe(200);

    // 5. Alice reviews final state and finalizes the bill
    const finalizeRes = await request(app)
      .post(`/api/splits/groups/${trip._id}/bills/${bill._id}/finalize`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({});

    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.data.bill.status).toBe('finalized');

    const createdExpense = finalizeRes.body.data.expense;
    expect(createdExpense.amount).toBe(1100);
    expect(createdExpense.receiptKey).toBe('receipts/trip1/fishermans-wharf.jpg');

    // 6. Verify Personal Transactions created for both users
    const bobTx = await Transaction.findOne({ userId: bobUserId, splitExpenseId: createdExpense._id });
    expect(bobTx).toBeTruthy();
    // Bob had 500 (fish) + 150 (beer) = 650. Tax on 650/1000 = 65. Bob's share = 715
    expect(bobTx.amount).toBeGreaterThan(0);

    const aliceTx = await Transaction.findOne({ userId: aliceUserId, splitExpenseId: createdExpense._id });
    expect(aliceTx).toBeTruthy();
    expect(aliceTx.amount).toBeGreaterThan(0);
    expect(bobTx.amount + aliceTx.amount).toBe(1100);

    // 7. Check Group Balances: Bob owes Alice his exact share
    const groupStatusRes = await request(app)
      .get('/api/splits/groups')
      .set('Authorization', `Bearer ${aliceToken}`);

    const refreshedTrip = groupStatusRes.body.data.find((g) => g._id === trip._id);
    const bobDebt = refreshedTrip.simplifiedDebts.find((d) => d.from === bobMemberId && d.to === aliceMemberId);
    expect(bobDebt).toBeTruthy();
    expect(bobDebt.amount).toBe(bobTx.amount);

    // 8. Bob settles up with Alice
    const settleRes = await request(app)
      .post(`/api/splits/groups/${trip._id}/settlements`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({
        from: bobMemberId,
        to: aliceMemberId,
        amount: bobDebt.amount,
        date: new Date().toISOString(),
        note: 'UPI Payment - Settle up for Fishermans Wharf',
      });

    expect(settleRes.status).toBe(201);

    // 9. Verify balances are fully cleared (0 remaining debts)
    const finalTripRes = await request(app)
      .get('/api/splits/groups')
      .set('Authorization', `Bearer ${aliceToken}`);

    const finalTrip = finalTripRes.body.data.find((g) => g._id === trip._id);
    expect(finalTrip.simplifiedDebts.length).toBe(0);
  });
});
