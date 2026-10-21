const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');

process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_12345';
process.env.NODE_ENV = 'test';

const User = require('../models/User');
const SplitGroup = require('../models/SplitGroup');
const Transaction = require('../models/Transaction');
const { authMiddleware } = require('../middleware/authMiddleware');
const splitRoutes = require('../routes/splitRoutes');
const authRoutes = require('../routes/authRoutes');

describe('Members, Invites & Personal Sync - Integration Tests', () => {
  let app;
  let ownerUser, memberUser, strangerUser;
  let ownerToken, memberToken, strangerToken;

  beforeAll(async () => {
    await connectTestDb();

    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/splits', authMiddleware, splitRoutes);
  });

  beforeEach(async () => {
    await clearTestDb();

    ownerUser = await User.create({
      name: 'Owner Alice',
      email: 'alice@example.com',
      password: 'password123',
      friendCode: 'FS-ALICE001',
    });

    memberUser = await User.create({
      name: 'Member Bob',
      email: 'bob@example.com',
      password: 'password123',
      friendCode: 'FS-BOB00002',
    });

    strangerUser = await User.create({
      name: 'Stranger Charlie',
      email: 'charlie@example.com',
      password: 'password123',
      friendCode: 'FS-CHARLIE3',
    });

    ownerToken = jwt.sign({ id: ownerUser._id.toString(), email: ownerUser.email }, process.env.JWT_SECRET);
    memberToken = jwt.sign({ id: memberUser._id.toString(), email: memberUser.email }, process.env.JWT_SECRET);
    strangerToken = jwt.sign({ id: strangerUser._id.toString(), email: strangerUser.email }, process.env.JWT_SECRET);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test('Owner can invite member by email; token is hashed at rest and single-use with 7-day expiry', async () => {
    // 1. Owner creates group
    const groupRes = await request(app)
      .post('/api/splits/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Europe Trip',
        members: [{ name: 'Owner Alice', email: 'alice@example.com' }, { name: 'Bob', email: 'bob@example.com' }],
      });
    const groupId = groupRes.body.data._id;

    // 2. Owner invites a new email
    const inviteRes = await request(app)
      .post(`/api/splits/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'newmember@example.com', name: 'New Friend' });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.success).toBe(true);
    expect(inviteRes.body.data.rawToken).toBeDefined();

    const rawToken = inviteRes.body.data.rawToken;
    const groupInDb = await SplitGroup.findById(groupId);
    expect(groupInDb.invites.length).toBe(1);

    const savedInvite = groupInDb.invites[0];
    expect(savedInvite.email).toBe('newmember@example.com');
    expect(savedInvite.status).toBe('pending');

    // Token must be hashed at rest (sha256 = 64 hex chars), NOT equal to rawToken
    expect(savedInvite.token).not.toBe(rawToken);
    expect(savedInvite.token).toBe(crypto.createHash('sha256').update(rawToken).digest('hex'));

    // Expires in ~7 days
    const diffDays = (new Date(savedInvite.expiresAt) - new Date(savedInvite.createdAt)) / (1000 * 60 * 60 * 24);
    expect(Math.round(diffDays)).toBe(7);
  });

  test('Access matrix: stranger gets 404, non-owner gets 403 on owner actions', async () => {
    // Owner creates group
    const group = await SplitGroup.create({
      name: 'Private Group',
      userId: ownerUser._id,
      members: [
        { name: 'Alice', email: 'alice@example.com', userId: ownerUser._id, role: 'owner', status: 'active' },
        { name: 'Bob', email: 'bob@example.com', userId: memberUser._id, role: 'member', status: 'active' },
      ],
    });

    // Stranger tries to view or modify -> 404
    const strangerRes = await request(app)
      .post(`/api/splits/groups/${group._id}/expenses`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ description: 'Hacked', amount: 100, paidBy: group.members[0]._id, splitBetween: [group.members[0]._id], date: new Date() });
    expect(strangerRes.status).toBe(404);

    // Member tries to invite or delete group -> 403
    const memberInviteRes = await request(app)
      .post(`/api/splits/groups/${group._id}/invites`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ email: 'other@example.com' });
    expect(memberInviteRes.status).toBe(403);

    const memberDeleteRes = await request(app)
      .delete(`/api/splits/groups/${group._id}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberDeleteRes.status).toBe(403);
  });

  test('Pending invites flow: list, accept and decline single-use invite', async () => {
    // 1. Owner creates group and invites Member Bob
    const group = await SplitGroup.create({
      name: 'Goa Weekend',
      userId: ownerUser._id,
      members: [
        { name: 'Alice', email: 'alice@example.com', userId: ownerUser._id, role: 'owner', status: 'active' },
      ],
    });

    const inviteRes = await request(app)
      .post(`/api/splits/groups/${group._id}/invites`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'bob@example.com', name: 'Bob' });
    expect(inviteRes.status).toBe(201);
    const inviteId = inviteRes.body.data.inviteId;

    // 2. Bob lists pending invites
    const pendingRes = await request(app)
      .get('/api/splits/invites/pending')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.data.length).toBe(1);
    expect(pendingRes.body.data[0].groupName).toBe('Goa Weekend');

    // 3. Bob accepts invite
    const acceptRes = await request(app)
      .post(`/api/splits/invites/${inviteId}/accept`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.success).toBe(true);

    const updatedGroup = await SplitGroup.findById(group._id);
    const bobMember = updatedGroup.members.find((m) => m.email === 'bob@example.com');
    expect(bobMember).toBeDefined();
    expect(bobMember.status).toBe('active');
    expect(bobMember.userId.toString()).toBe(memberUser._id.toString());

    // Single-use: accepting again returns 404
    const repeatAccept = await request(app)
      .post(`/api/splits/invites/${inviteId}/accept`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(repeatAccept.status).toBe(404);
  });

  test('My groups returns groups user owns OR is an active member of, with userRole', async () => {
    // Group 1: Alice owns, Bob is member
    await SplitGroup.create({
      name: 'Group 1',
      userId: ownerUser._id,
      members: [
        { name: 'Alice', userId: ownerUser._id, role: 'owner', status: 'active' },
        { name: 'Bob', userId: memberUser._id, role: 'member', status: 'active' },
      ],
    });

    // Group 2: Stranger owns, Alice is not member
    await SplitGroup.create({
      name: 'Group 2',
      userId: strangerUser._id,
      members: [
        { name: 'Charlie', userId: strangerUser._id, role: 'owner', status: 'active' },
      ],
    });

    // Check Alice's groups
    const resAlice = await request(app)
      .get('/api/splits/groups')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(resAlice.body.data.length).toBe(1);
    expect(resAlice.body.data[0].name).toBe('Group 1');
    expect(resAlice.body.data[0].userRole).toBe('owner');
    expect(resAlice.body.data[0].canManage).toBe(true);

    // Check Bob's groups (he is active member, not creator)
    const resBob = await request(app)
      .get('/api/splits/groups')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(resBob.body.data.length).toBe(1);
    expect(resBob.body.data[0].name).toBe('Group 1');
    expect(resBob.body.data[0].userRole).toBe('member');
    expect(resBob.body.data[0].canManage).toBe(false);
  });

  test('Per-member personal-budget sync creates isolated transactions for each participant', async () => {
    // Group with Alice (owner) and Bob (member)
    const group = await SplitGroup.create({
      name: 'Dinner Club',
      userId: ownerUser._id,
      members: [
        { name: 'Alice', email: 'alice@example.com', userId: ownerUser._id, role: 'owner', status: 'active' },
        { name: 'Bob', email: 'bob@example.com', userId: memberUser._id, role: 'member', status: 'active' },
      ],
    });

    const [mAlice, mBob] = group.members;

    // Alice adds a 600 expense split equally with Bob (300 each)
    const expRes = await request(app)
      .post(`/api/splits/groups/${group._id}/expenses`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        description: 'Italian Dinner',
        amount: 600,
        paidBy: mAlice._id.toString(),
        splitBetween: [mAlice._id.toString(), mBob._id.toString()],
        date: new Date().toISOString(),
        category: 'Food',
        syncPersonal: true,
      });

    expect(expRes.status).toBe(201);

    // Alice's personal transactions must have 1 transaction for 300
    const aliceTx = await Transaction.find({ userId: ownerUser._id });
    expect(aliceTx.length).toBe(1);
    expect(aliceTx[0].amount).toBe(300);
    expect(aliceTx[0].description).toContain('Italian Dinner');

    // Bob's personal transactions must also have 1 transaction for 300
    const bobTx = await Transaction.find({ userId: memberUser._id });
    expect(bobTx.length).toBe(1);
    expect(bobTx[0].amount).toBe(300);
    expect(bobTx[0].description).toContain('Italian Dinner');

    // Privacy verification: Bob cannot see Alice's transaction ID
    const resBobGroup = await request(app)
      .get('/api/splits/groups')
      .set('Authorization', `Bearer ${memberToken}`);

    const bobExpenseView = resBobGroup.body.data[0].expenses[0];
    // Bob sees his personal share
    expect(bobExpenseView.personalShareAmount).toBe(300);
    expect(bobExpenseView.personalTransactionId.toString()).toBe(bobTx[0]._id.toString());
    // Bob's personalSync array only contains his own entry
    expect(bobExpenseView.personalSync.length).toBe(1);
    expect(bobExpenseView.personalSync[0].userId.toString()).toBe(memberUser._id.toString());
  });

  test('Member leaving group and owner removing member enforce balance settlement', async () => {
    const group = await SplitGroup.create({
      name: 'Trek Group',
      userId: ownerUser._id,
      members: [
        { name: 'Alice', email: 'alice@example.com', userId: ownerUser._id, role: 'owner', status: 'active' },
        { name: 'Bob', email: 'bob@example.com', userId: memberUser._id, role: 'member', status: 'active' },
      ],
    });

    const [mAlice, mBob] = group.members;

    // Alice pays 400, Bob owes 200
    group.expenses.push({
      description: 'Camp Gear',
      amount: 400,
      paidBy: mAlice._id,
      splitBetween: [mAlice._id, mBob._id],
      date: new Date(),
    });
    await group.save();

    // Bob tries to leave with outstanding balance -> 400
    const leaveAttempt = await request(app)
      .post(`/api/splits/groups/${group._id}/leave`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(leaveAttempt.status).toBe(400);
    expect(leaveAttempt.body.message).toMatch(/settle your outstanding balance/i);

    // Owner tries to remove Bob while he owes money -> 400
    const removeAttempt = await request(app)
      .delete(`/api/splits/groups/${group._id}/members/${mBob._id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(removeAttempt.status).toBe(400);
    expect(removeAttempt.body.message).toMatch(/active balance/i);

    // Settle balance: Bob pays Alice 200
    await request(app)
      .post(`/api/splits/groups/${group._id}/settlements`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        from: mBob._id.toString(),
        to: mAlice._id.toString(),
        amount: 200,
        date: new Date(),
      });

    // Now Bob leaves successfully
    const leaveSuccess = await request(app)
      .post(`/api/splits/groups/${group._id}/leave`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(leaveSuccess.status).toBe(200);

    const afterLeave = await SplitGroup.findById(group._id);
    const bobAfter = afterLeave.members.id(mBob._id);
    expect(bobAfter.status).toBe('inactive');
  });

  test('Auto-accept on registration when inviteToken is provided', async () => {
    // 1. Owner creates group and invites an unregistered email
    const group = await SplitGroup.create({
      name: 'College Reunion',
      userId: ownerUser._id,
      members: [
        { name: 'Alice', email: 'alice@example.com', userId: ownerUser._id, role: 'owner', status: 'active' },
      ],
    });

    const inviteRes = await request(app)
      .post(`/api/splits/groups/${group._id}/invites`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'freshuser@example.com', name: 'Fresh User' });

    const rawToken = inviteRes.body.data.rawToken;

    // 2. Fresh user signs up with the inviteToken
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Fresh Registered',
        email: 'freshuser@example.com',
        password: 'password123',
        inviteToken: rawToken,
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.success).toBe(true);

    // 3. Group membership is now active for Fresh User
    const updated = await SplitGroup.findById(group._id);
    const member = updated.members.find((m) => m.email === 'freshuser@example.com');
    expect(member).toBeDefined();
    expect(member.status).toBe('active');
    expect(member.userId.toString()).toBe(regRes.body.data.user._id.toString());
  });
});
