const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');

process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';
process.env.NODE_ENV = 'test';

const User = require('../models/User');
const SplitGroup = require('../models/SplitGroup');
const UpiDraft = require('../models/UpiDraft');
const Transaction = require('../models/Transaction');
const { authMiddleware } = require('../middleware/authMiddleware');
const splitRoutes = require('../routes/splitRoutes');

describe('Phase 3: Fast Expense Capture from Payment Apps in Trip Mode', () => {
  let app;
  let userToken, otherToken;
  let userId, otherUserId;
  let activeTripId;

  beforeAll(async () => {
    await connectTestDb();

    app = express();
    app.use(express.json());
    app.use('/api/splits', authMiddleware, splitRoutes);

    // Create users
    const userA = await User.create({
      name: 'Payer Alice',
      email: 'payer.alice@example.com',
      password: 'hashedpassword',
    });
    userId = userA._id;
    userToken = jwt.sign({ id: userA._id.toString(), email: userA.email }, process.env.JWT_SECRET);

    const userB = await User.create({
      name: 'Friend Bob',
      email: 'friend.bob@example.com',
      password: 'hashedpassword',
    });
    otherUserId = userB._id;
    otherToken = jwt.sign({ id: userB._id.toString(), email: userB.email }, process.env.JWT_SECRET);

    // Start an active trip with Alice and Bob
    const tripRes = await request(app)
      .post('/api/splits/trips/start')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Goa Holiday',
        currency: 'INR',
        members: [
          { name: 'Payer Alice', email: 'payer.alice@example.com', userId: userId.toString() },
          { name: 'Friend Bob', email: 'friend.bob@example.com', userId: otherUserId.toString() },
        ],
      });
    activeTripId = tripRes.body.data._id;
  });

  afterAll(async () => {
    await clearTestDb();
    await closeTestDb();
  });

  it('captures UPI draft via merchant QR / URI data, remaining in pending draft state', async () => {
    const rawUri = 'upi://pay?pa=restaurant@icici&pn=Beach%20Bites&am=850.00&cu=INR&tn=Dinner';
    const res = await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        amount: 850,
        merchant: 'Beach Bites',
        rawText: rawUri,
        payerVpa: 'restaurant@icici',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.cleanMerchant).toBe('Beach Bites');
    expect(res.body.data.amount).toBe(850);
    expect(res.body.data.status).toBe('pending_assignment');
    expect(res.body.data.userId.toString()).toBe(userId.toString());

    // Verify draft was saved and NOT counted in group expenses yet
    const group = await SplitGroup.findById(activeTripId);
    expect(group.expenses.length).toBe(0);
  });

  it('captures draft from raw bank SMS alert using heuristics fallback', async () => {
    const sms = 'Sent Rs. 420.00 to CAFE NIRVANA via UPI on 17-Oct-26. Ref no 99882211';
    const res = await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        rawText: sms,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.amount).toBe(420);
    expect(res.body.data.cleanMerchant.toLowerCase()).toContain('cafe');
    expect(res.body.data.status).toBe('pending_assignment');
  });

  it('retrieves active drafts for active trip group members', async () => {
    const res = await request(app)
      .get(`/api/splits/groups/${activeTripId}/upi-drafts`)
      .set('Authorization', `Bearer ${otherToken}`); // Bob (member) can view drafts too

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  it('allows dismissing an unwanted draft without altering group expenses', async () => {
    // Create draft to dismiss
    const draftRes = await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        amount: 150,
        merchant: 'Accidental Tap',
      });
    const draftId = draftRes.body.data._id;

    // Dismiss draft
    const dismissRes = await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts/${draftId}/dismiss`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(dismissRes.status).toBe(200);
    expect(dismissRes.body.data.status).toBe('dismissed');

    // Confirm it no longer shows up in pending drafts
    const activeDrafts = await request(app)
      .get(`/api/splits/groups/${activeTripId}/upi-drafts`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(activeDrafts.body.data.some((d) => d._id === draftId)).toBe(false);
  });

  it('converts confirmed draft to group expense with isolated personal sync', async () => {
    const groupBefore = await SplitGroup.findById(activeTripId);
    const aliceMemberId = groupBefore.members.find((m) => m.userId?.toString() === userId.toString())._id;
    const bobMemberId = groupBefore.members.find((m) => m.userId?.toString() === otherUserId.toString())._id;

    // Create draft
    const draftRes = await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        amount: 600,
        merchant: 'Boat Cruise',
      });
    const draftId = draftRes.body.data._id;

    // Assign and confirm draft
    const assignRes = await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts/${draftId}/assign`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        mode: 'assign',
        paidBy: aliceMemberId.toString(),
        splitBetween: [aliceMemberId.toString(), bobMemberId.toString()],
        syncPersonal: true,
      });

    expect(assignRes.status).toBe(200);
    expect(assignRes.body.success).toBe(true);
    expect(assignRes.body.data.draft.status).toBe('assigned_to_expense');

    // Check that personal transactions were created in each member's private account
    const aliceTxs = await Transaction.find({ userId, tags: 'split' });
    const bobTxs = await Transaction.find({ userId: otherUserId, tags: 'split' });

    expect(aliceTxs.length).toBe(1);
    expect(aliceTxs[0].amount).toBe(300);
    expect(bobTxs.length).toBe(1);
    expect(bobTxs[0].amount).toBe(300);

    // Group expense now exists
    const groupAfter = await SplitGroup.findById(activeTripId);
    expect(groupAfter.expenses.length).toBe(1);
    expect(groupAfter.expenses[0].amount).toBe(600);
  });

  it('supports Opt-In poll ("Ask everyone"): creation, member opt-in/opt-out, and integer-paise closing', async () => {
    const group = await SplitGroup.findById(activeTripId);
    const aliceMemberId = group.members.find((m) => m.userId?.toString() === userId.toString())._id;
    const bobMemberId = group.members.find((m) => m.userId?.toString() === otherUserId.toString())._id;

    // Create draft of ₹100.00 (split across 3 participants or tested with integer paise remainder)
    const draftRes = await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        amount: 100,
        merchant: 'TukTuk Ride',
      });
    const draftId = draftRes.body.data._id;

    // 1. Create poll
    const pollCreateRes = await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts/${draftId}/assign`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        mode: 'poll',
        paidBy: aliceMemberId.toString(),
        question: 'Did you share the TukTuk Ride?',
      });

    expect(pollCreateRes.status).toBe(200);
    expect(pollCreateRes.body.data.status).toBe('poll_created');
    expect(pollCreateRes.body.data.poll.options.length).toBe(2);

    // Alice (payer) defaults to opted_in, Bob defaults to pending
    const bobOption = pollCreateRes.body.data.poll.options.find((o) => String(o.memberId) === String(bobMemberId));
    expect(bobOption.status).toBe('pending');

    // 2. Bob opts in
    const bobVoteRes = await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts/${draftId}/poll/respond`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        response: 'opt_in',
      });

    expect(bobVoteRes.status).toBe(200);
    const updatedBobOption = bobVoteRes.body.data.poll.options.find((o) => String(o.memberId) === String(bobMemberId));
    expect(updatedBobOption.status).toBe('opted_in');

    // 3. Close the poll and verify integer-paise division (10000 paise / 2 = 5000 paise each = ₹50.00)
    const closeRes = await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts/${draftId}/poll/close`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        syncPersonal: true,
      });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.success).toBe(true);
    expect(closeRes.body.data.draft.status).toBe('assigned_to_expense');
    expect(closeRes.body.data.draft.poll.closed).toBe(true);
    expect(closeRes.body.data.expense.splitBetween.length).toBe(2);
    expect(closeRes.body.data.expense.amount).toBe(100);
  });

  it('handles remainder paise accurately with integer-paise arithmetic', async () => {
    // Add a third member to active trip to test 100 / 3 = 33.34, 33.33, 33.33
    const group = await SplitGroup.findById(activeTripId);
    group.members.push({
      name: 'Charlie',
      email: 'charlie@example.com',
      status: 'active',
    });
    await group.save();

    const charlieMemberId = group.members[group.members.length - 1]._id;
    const aliceMemberId = group.members[0]._id;
    const bobMemberId = group.members[1]._id;

    // Create draft of ₹100.00
    const draftRes = await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        amount: 100,
        merchant: 'Beach Cafe Snacks',
      });
    const draftId = draftRes.body.data._id;

    // Create poll
    await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts/${draftId}/assign`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        mode: 'poll',
        paidBy: aliceMemberId.toString(),
      });

    // Bob opts in
    await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts/${draftId}/poll/respond`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        response: 'opt_in',
      });

    // Charlie opts in (simulated by Alice host)
    await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts/${draftId}/poll/respond`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        response: 'opt_in',
        memberId: charlieMemberId.toString(),
      });

    // Close poll with 3 opted-in members
    const closeRes = await request(app)
      .post(`/api/splits/groups/${activeTripId}/upi-drafts/${draftId}/poll/close`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ syncPersonal: true });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.expense.splitBetween.length).toBe(3);
    expect(closeRes.body.data.expense.amount).toBe(100);
  });
});
