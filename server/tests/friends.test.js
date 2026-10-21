const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');

process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';
process.env.NODE_ENV = 'test';

const User = require('../models/User');
const Friendship = require('../models/Friendship');
const SplitGroup = require('../models/SplitGroup');
const Transaction = require('../models/Transaction');
const { authMiddleware } = require('../middleware/authMiddleware');
const friendRoutes = require('../routes/friendRoutes');

describe('Friends System API - Integration Tests (Supertest + In-Memory Mongo)', () => {
  let app;
  let userA, userB, userC;
  let tokenA, tokenB, tokenC;

  beforeAll(async () => {
    await connectTestDb();

    app = express();
    app.use(express.json());
    app.use('/api/friends', authMiddleware, friendRoutes);
  });

  beforeEach(async () => {
    await clearTestDb();

    // Create 3 test users
    userA = await User.create({
      name: 'Alice Cooper',
      email: 'alice@example.com',
      password: 'password123',
      friendCode: 'FS-ALICE001',
    });

    userB = await User.create({
      name: 'Bob Martin',
      email: 'bob@example.com',
      password: 'password123',
      friendCode: 'FS-BOB00002',
    });

    userC = await User.create({
      name: 'Charlie Day',
      email: 'charlie@example.com',
      password: 'password123',
      friendCode: 'FS-CHARLIE3',
    });

    tokenA = jwt.sign({ id: userA._id.toString(), email: userA.email }, process.env.JWT_SECRET);
    tokenB = jwt.sign({ id: userB._id.toString(), email: userB.email }, process.env.JWT_SECRET);
    tokenC = jwt.sign({ id: userC._id.toString(), email: userC.email }, process.env.JWT_SECRET);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test('Friendship model enforces unique pairKey and blocks self-friending', async () => {
    // Self friending
    await expect(
      Friendship.create({
        requester: userA._id,
        recipient: userA._id,
      })
    ).rejects.toThrow('Cannot friend yourself');

    // Create A -> B
    const f1 = await Friendship.create({
      requester: userA._id,
      recipient: userB._id,
    });
    expect(f1.pairKey).toBeDefined();

    // Attempting duplicate B -> A with pairKey
    await expect(
      Friendship.create({
        requester: userB._id,
        recipient: userA._id,
      })
    ).rejects.toThrow();
  });

  test('sendFriendRequest by email to existing user creates pending request', async () => {
    const res = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: 'bob@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Friend request sent');

    const created = await Friendship.findOne({
      requester: userA._id,
      recipient: userB._id,
    });
    expect(created).not.toBeNull();
    expect(created.status).toBe('pending');
  });

  test('sendFriendRequest by email to non-existing user does not leak account absence', async () => {
    const res = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: 'nonexistent@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Friend request sent');

    // No friendship created in database since user does not exist
    const count = await Friendship.countDocuments();
    expect(count).toBe(0);
  });

  test('sendFriendRequest prevents self-friending by email and code', async () => {
    const resEmail = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: 'alice@example.com' });

    expect(resEmail.status).toBe(400);
    expect(resEmail.body.message).toMatch(/cannot add yourself/i);

    const resCode = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'FS-ALICE001' });

    expect(resCode.status).toBe(400);
    expect(resCode.body.message).toMatch(/cannot add yourself/i);
  });

  test('sendFriendRequest by valid and invalid friend code', async () => {
    const invalidRes = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'FS-NONEXISTENT' });

    expect(invalidRes.status).toBe(404);
    expect(invalidRes.body.message).toMatch(/invalid friend invite code/i);

    const validRes = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'fs-bob00002' }); // case insensitive

    expect(validRes.status).toBe(201);
    expect(validRes.body.success).toBe(true);

    const f = await Friendship.findOne({ requester: userA._id, recipient: userB._id });
    expect(f.status).toBe('pending');
  });

  test('auto-accepts if the other party already sent a pending request', async () => {
    // B sends to A
    await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ email: 'alice@example.com' });

    // A sends to B -> should auto accept
    const res = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: 'bob@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/accepted/i);

    const f = await Friendship.findOne({ requester: userB._id, recipient: userA._id });
    expect(f.status).toBe('accepted');
  });

  test('list pending requests differentiates incoming and outgoing', async () => {
    // A -> B
    await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: 'bob@example.com' });

    // C -> A
    await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ email: 'alice@example.com' });

    // Check from A's perspective
    const resA = await request(app)
      .get('/api/friends/requests')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(resA.status).toBe(200);
    expect(resA.body.data.incoming.length).toBe(1);
    expect(resA.body.data.incoming[0].requester.email).toBe('charlie@example.com');

    expect(resA.body.data.outgoing.length).toBe(1);
    expect(resA.body.data.outgoing[0].recipient.email).toBe('bob@example.com');
  });

  test('accept and decline friend request endpoints', async () => {
    // A -> B
    await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: 'bob@example.com' });

    const f = await Friendship.findOne({ requester: userA._id, recipient: userB._id });

    // Requester A cannot accept own request
    const unauthorizedAccept = await request(app)
      .post(`/api/friends/${f._id}/accept`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(unauthorizedAccept.status).toBe(404);

    // Recipient B accepts
    const acceptRes = await request(app)
      .post(`/api/friends/${f._id}/accept`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.success).toBe(true);

    const updated = await Friendship.findById(f._id);
    expect(updated.status).toBe('accepted');

    // Test decline: C -> B, B declines
    await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ email: 'bob@example.com' });

    const fCB = await Friendship.findOne({ requester: userC._id, recipient: userB._id });
    const declineRes = await request(app)
      .post(`/api/friends/${fCB._id}/decline`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(declineRes.status).toBe(200);

    const declinedRecord = await Friendship.findById(fCB._id);
    expect(declinedRecord.status).toBe('declined');

    // C resending to B after decline resets to pending
    const resendRes = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ email: 'bob@example.com' });
    expect(resendRes.status).toBe(200);

    const resentRecord = await Friendship.findById(fCB._id);
    expect(resentRecord.status).toBe('pending');
  });

  test('lists accepted friends and counts shared active groups', async () => {
    // A and B are accepted friends
    await Friendship.create({
      requester: userA._id,
      recipient: userB._id,
      status: 'accepted',
    });

    // Create shared split group where both A and B are active members
    await SplitGroup.create({
      name: 'Goa Trip',
      userId: userA._id,
      members: [
        { name: 'Alice', userId: userA._id, status: 'active', role: 'owner' },
        { name: 'Bob', userId: userB._id, status: 'active', role: 'member' },
      ],
    });

    const resA = await request(app)
      .get('/api/friends')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(resA.status).toBe(200);
    expect(resA.body.data.length).toBe(1);
    expect(resA.body.data[0].email).toBe('bob@example.com');
    expect(resA.body.data[0].sharedGroupsCount).toBe(1);

    // B also sees A
    const resB = await request(app)
      .get('/api/friends')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    expect(resB.body.data.length).toBe(1);
    expect(resB.body.data[0].email).toBe('alice@example.com');
    expect(resB.body.data[0].sharedGroupsCount).toBe(1);
  });

  test('removeFriend deletes friendship', async () => {
    const f = await Friendship.create({
      requester: userA._id,
      recipient: userB._id,
      status: 'accepted',
    });

    const res = await request(app)
      .delete(`/api/friends/${f._id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = await Friendship.findById(f._id);
    expect(check).toBeNull();
  });

  test('blockUser and unblockUser work correctly', async () => {
    // A blocks C
    const blockRes = await request(app)
      .post(`/api/friends/${userC._id}/block`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(blockRes.status).toBe(200);
    expect(blockRes.body.message).toMatch(/blocked/i);

    const f = await Friendship.findOne({
      status: 'blocked',
      blockedBy: userA._id,
    });
    expect(f).not.toBeNull();

    // C tries to send friend request to A -> silent 200 without creating pending request
    const cReq = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ email: 'alice@example.com' });

    expect(cReq.status).toBe(200);
    const stillBlocked = await Friendship.findById(f._id);
    expect(stillBlocked.status).toBe('blocked');

    // A unblocks C
    const unblockRes = await request(app)
      .post(`/api/friends/${f._id}/unblock`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(unblockRes.status).toBe(200);
    const afterUnblock = await Friendship.findById(f._id);
    expect(afterUnblock).toBeNull();
  });

  test('invite code retrieval and regeneration', async () => {
    const codeRes = await request(app)
      .get('/api/friends/my-code')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(codeRes.status).toBe(200);
    expect(codeRes.body.data.friendCode).toBe('FS-ALICE001');
    expect(codeRes.body.data.inviteLink).toContain('FS-ALICE001');

    const regenRes = await request(app)
      .post('/api/friends/my-code/regenerate')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(regenRes.status).toBe(200);
    expect(regenRes.body.data.friendCode).not.toBe('FS-ALICE001');
    expect(regenRes.body.data.friendCode).toMatch(/^FS-[A-F0-9]{8}$/);
  });

  test('privacy check: friends API never returns transactions, budgets or goals', async () => {
    // Create personal transaction for Bob
    await Transaction.create({
      userId: userB._id,
      amount: 1500,
      description: 'Private Medical Bill',
      category: 'Health',
      date: new Date(),
      type: 'expense',
    });

    await Friendship.create({
      requester: userA._id,
      recipient: userB._id,
      status: 'accepted',
    });

    const res = await request(app)
      .get('/api/friends')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const friendObj = res.body.data[0];
    expect(friendObj).toBeDefined();
    // Exposes only minimal safe user fields
    expect(friendObj.password).toBeUndefined();
    expect(friendObj.transactions).toBeUndefined();
    expect(friendObj.budgets).toBeUndefined();
    expect(friendObj.goals).toBeUndefined();
    expect(friendObj.email).toBe('bob@example.com');
  });
});
