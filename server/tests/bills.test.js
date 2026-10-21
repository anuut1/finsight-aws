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

describe('Split Group Itemized Bills ("Split by Items") API', () => {
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

  const setupTestGroup = async () => {
    const groupRes = await request(app)
      .post('/api/splits/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Goa Trip 2026',
        members: [
          { name: 'Alice Owner', userId: ownerId },
          { name: 'Bob Member', userId: memberId },
        ],
      });

    const group = groupRes.body.data;
    const ownerMemberId = group.members.find((m) => m.userId === ownerId)._id;
    const bobMemberId = group.members.find((m) => m.userId === memberId)._id;

    return { group, ownerMemberId, bobMemberId };
  };

  test('validates bill total: rejects creation when items + charges - discount != total', async () => {
    const { group, ownerMemberId } = await setupTestGroup();

    // Sum is 400 + 200 + 50 (tax) = 650, but total is sent as 800
    const res = await request(app)
      .post(`/api/splits/groups/${group._id}/bills`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Curlies Shack Dinner',
        paidBy: ownerMemberId,
        items: [
          { name: 'Fish Thali', qty: 1, price: 400 },
          { name: 'Garlic Naan', qty: 2, price: 200 },
        ],
        tax: 50,
        serviceCharge: 0,
        tip: 0,
        discount: 0,
        total: 800, // Discrepancy!
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/do not match total/i);
  });

  test('creates bill with status claiming and allows active members to fetch it', async () => {
    const { group, ownerMemberId } = await setupTestGroup();

    const res = await request(app)
      .post(`/api/splits/groups/${group._id}/bills`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Curlies Shack Dinner',
        paidBy: ownerMemberId,
        receiptKey: 'receipts/trip1/curlies.jpg',
        items: [
          { name: 'Fish Thali', qty: 1, price: 400 },
          { name: 'Kingfisher Beer', qty: 2, price: 300 },
        ],
        tax: 70,
        serviceCharge: 30,
        tip: 0,
        discount: 0,
        total: 800, // 400 + 300 + 70 + 30 = 800
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('claiming');
    expect(res.body.data.items.length).toBe(2);

    const billId = res.body.data._id;

    // Active member fetches bill
    const getRes = await request(app)
      .get(`/api/splits/groups/${group._id}/bills/${billId}`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.bill.title).toBe('Curlies Shack Dinner');
    expect(getRes.body.data.breakdown.total).toBe(800);
  });

  test('denies stranger access with 404 (group isolation)', async () => {
    const { group, ownerMemberId } = await setupTestGroup();

    const createRes = await request(app)
      .post(`/api/splits/groups/${group._id}/bills`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({
        title: 'Hacked Bill',
        paidBy: ownerMemberId,
        items: [{ name: 'Item', qty: 1, price: 100 }],
        total: 100,
      });

    expect(createRes.status).toBe(404);
  });

  test('allows members to claim items and compute live proportional shares', async () => {
    const { group, ownerMemberId } = await setupTestGroup();

    const createRes = await request(app)
      .post(`/api/splits/groups/${group._id}/bills`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Beach Cafe',
        paidBy: ownerMemberId,
        items: [
          { name: 'Burger', qty: 1, price: 300 },
          { name: 'Pizza', qty: 1, price: 500 },
          { name: 'Beer', qty: 2, price: 200 },
        ],
        tax: 100,
        serviceCharge: 0,
        tip: 0,
        discount: 0,
        total: 1100, // 300 + 500 + 200 + 100 = 1100
      });

    const bill = createRes.body.data;
    const burgerItem = bill.items[0];
    const beerItem = bill.items[2];

    // Bob (member) claims Burger and 1 Beer
    const claimRes = await request(app)
      .post(`/api/splits/groups/${group._id}/bills/${bill._id}/claim`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        claims: [
          { itemId: burgerItem._id, units: 1 },
          { itemId: beerItem._id, units: 1 },
        ],
      });

    expect(claimRes.status).toBe(200);
    expect(claimRes.body.success).toBe(true);

    // Verify Bob's myShare calculation
    // Claimed: Burger (300) + 1 unit of Beer (100) = 400 subtotal
    // Unclaimed: Pizza (500) + 1 unit of Beer (100) = 600 unclaimed
    // Default unclaimed policy: split equally (300 each)
    // Bob's effective subtotal: 400 + 300 = 700
    // Total items: 1000. Bob's share ratio: 700 / 1000 = 0.7
    // Proportional tax (100 total): Bob's tax share = 70
    // Bob's total: 700 + 70 = 770
    const myShare = claimRes.body.data.myShare;
    expect(myShare).toBeTruthy();
    expect(myShare.itemsSubtotal).toBe(400);
    expect(myShare.unclaimedShare).toBe(300);
    expect(myShare.subtotal).toBe(700);
    expect(myShare.taxShare).toBe(70);
    expect(myShare.total).toBe(770);
  });

  test('finalizes bill idempotently, locks edits, and creates group expense', async () => {
    const { group, ownerMemberId, bobMemberId } = await setupTestGroup();

    // Create bill
    const createRes = await request(app)
      .post(`/api/splits/groups/${group._id}/bills`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Resort Lunch',
        paidBy: ownerMemberId,
        receiptKey: 'receipts/trip1/resort.jpg',
        items: [
          { name: 'Lunch Buffet', qty: 2, price: 1000 },
        ],
        tax: 100,
        total: 1100,
      });

    const bill = createRes.body.data;
    const buffetItem = bill.items[0];

    // Bob claims 1 buffet
    await request(app)
      .post(`/api/splits/groups/${group._id}/bills/${bill._id}/claim`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        claims: [{ itemId: buffetItem._id, units: 1 }],
      });

    // Owner claims 1 buffet
    await request(app)
      .post(`/api/splits/groups/${group._id}/bills/${bill._id}/claim`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        claims: [{ itemId: buffetItem._id, units: 1 }],
      });

    // Finalize bill as Owner
    const finalizeRes = await request(app)
      .post(`/api/splits/groups/${group._id}/bills/${bill._id}/finalize`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.success).toBe(true);
    expect(finalizeRes.body.data.bill.status).toBe('finalized');

    const createdExpense = finalizeRes.body.data.expense;
    expect(createdExpense.description).toBe('Resort Lunch');
    expect(createdExpense.amount).toBe(1100);
    expect(createdExpense.receiptKey).toBe('receipts/trip1/resort.jpg');

    // Verify personal transaction created for Bob (550 share)
    const bobTx = await Transaction.findOne({ userId: memberId, splitExpenseId: createdExpense._id });
    expect(bobTx).toBeTruthy();
    expect(bobTx.amount).toBe(550);

    // IDEMPOTENCY TEST: Calling finalize a second time must return the same expense without duplicating
    const secondFinalizeRes = await request(app)
      .post(`/api/splits/groups/${group._id}/bills/${bill._id}/finalize`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    expect(secondFinalizeRes.status).toBe(200);
    expect(secondFinalizeRes.body.message).toMatch(/already finalized/i);

    // Check database to ensure no duplicate expense in group
    const refreshedGroup = await SplitGroup.findById(group._id);
    const matchingExpenses = refreshedGroup.expenses.filter((e) => e.description === 'Resort Lunch');
    expect(matchingExpenses.length).toBe(1);

    // EDITS LOCKED TEST: Claiming items after finalize must be rejected
    const postFinalizeClaim = await request(app)
      .post(`/api/splits/groups/${group._id}/bills/${bill._id}/claim`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        claims: [{ itemId: buffetItem._id, units: 2 }],
      });

    expect(postFinalizeClaim.status).toBe(400);
    expect(postFinalizeClaim.body.message).toMatch(/cannot be modified/i);
  });
});
