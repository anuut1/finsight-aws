const mongoose = require('mongoose');
const SplitGroup = require('../models/SplitGroup');

describe('SplitGroup Mongoose Schema — Unit Tests', () => {
  test('initializes default share structure with enabled=false and null token', () => {
    const group = new SplitGroup({
      userId: new mongoose.Types.ObjectId(),
      name: 'Weekend Getaway',
      members: [
        { name: 'Alice', email: 'alice@example.com' },
        { name: 'Bob', email: 'bob@example.com' },
      ],
    });

    expect(group.share).toBeDefined();
    expect(group.share.enabled).toBe(false);
    expect(group.share.token).toBeNull();
    expect(group.share.expiresAt).toBeNull();
  });

  test('member schema supports optional userId, role enum, and status enum with proper defaults', () => {
    const group = new SplitGroup({
      userId: new mongoose.Types.ObjectId(),
      name: 'Housemates',
      members: [
        {
          name: 'Host User',
          email: 'host@example.com',
          userId: new mongoose.Types.ObjectId(),
          role: 'owner',
          status: 'active',
        },
        {
          name: 'Invited Friend',
          email: 'friend@example.com',
          // role and status omitted to check defaults
        },
      ],
    });

    expect(group.members[0].role).toBe('owner');
    expect(group.members[0].status).toBe('active');
    expect(group.members[0].userId).toBeDefined();

    expect(group.members[1].role).toBe('member');
    expect(group.members[1].status).toBe('active');
    expect(group.members[1].userId).toBeUndefined();
  });

  test('expense schema supports createdBy and personalSync array', () => {
    const creatorId = new mongoose.Types.ObjectId();
    const transactionId = new mongoose.Types.ObjectId();
    const m1 = new mongoose.Types.ObjectId();
    const m2 = new mongoose.Types.ObjectId();

    const group = new SplitGroup({
      userId: creatorId,
      name: 'Dinner Group',
      members: [
        { _id: m1, name: 'Alice' },
        { _id: m2, name: 'Bob' },
      ],
      expenses: [
        {
          description: 'Pizza',
          amount: 600,
          paidBy: m1,
          splitBetween: [m1, m2],
          date: new Date(),
          createdBy: creatorId,
          personalSync: [
            {
              userId: creatorId,
              amount: 300,
              transactionId: transactionId,
            },
          ],
        },
      ],
    });

    const exp = group.expenses[0];
    expect(exp.createdBy.toString()).toBe(creatorId.toString());
    expect(exp.personalSync).toHaveLength(1);
    expect(exp.personalSync[0].amount).toBe(300);
    expect(exp.personalSync[0].userId.toString()).toBe(creatorId.toString());
    expect(exp.personalSync[0].transactionId.toString()).toBe(transactionId.toString());
  });

  test('settlement schema supports createdBy field', () => {
    const creatorId = new mongoose.Types.ObjectId();
    const m1 = new mongoose.Types.ObjectId();
    const m2 = new mongoose.Types.ObjectId();

    const group = new SplitGroup({
      userId: creatorId,
      name: 'Settle Group',
      members: [
        { _id: m1, name: 'Alice' },
        { _id: m2, name: 'Bob' },
      ],
      settlements: [
        {
          from: m2,
          to: m1,
          amount: 300,
          date: new Date(),
          createdBy: creatorId,
        },
      ],
    });

    expect(group.settlements[0].createdBy.toString()).toBe(creatorId.toString());
  });

  test('invites schema allows adding invite tokens and statuses', () => {
    const inviterId = new mongoose.Types.ObjectId();
    const group = new SplitGroup({
      userId: inviterId,
      name: 'Invites Test',
      members: [{ name: 'Owner' }],
      invites: [
        {
          email: 'newfriend@example.com',
          token: 'secure_invite_token_123',
          role: 'member',
          invitedBy: inviterId,
          status: 'pending',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    expect(group.invites).toHaveLength(1);
    expect(group.invites[0].email).toBe('newfriend@example.com');
    expect(group.invites[0].token).toBe('secure_invite_token_123');
    expect(group.invites[0].status).toBe('pending');
  });
});
