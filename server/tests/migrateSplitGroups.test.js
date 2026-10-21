const mongoose = require('mongoose');
const SplitGroup = require('../models/SplitGroup');
const { migrateSplitGroups } = require('../scripts/migrateSplitGroups');

describe('migrateSplitGroups Script — Unit & Idempotency Tests', () => {
  const creatorId = new mongoose.Types.ObjectId();
  const ownerMemberId = new mongoose.Types.ObjectId();
  const friendMemberId = new mongoose.Types.ObjectId();
  const personalTxId = new mongoose.Types.ObjectId();

  let mockGroups = [];

  beforeEach(() => {
    // Construct a legacy SplitGroup document copy
    const legacyGroup = new SplitGroup({
      _id: new mongoose.Types.ObjectId(),
      userId: creatorId,
      name: 'Legacy Split Trip',
      ownerMemberId: ownerMemberId,
      members: [
        {
          _id: ownerMemberId,
          name: 'Host User',
          email: 'host@example.com',
          // role, status, userId not yet migrated
        },
        {
          _id: friendMemberId,
          name: 'Friend User',
          email: 'friend@example.com',
          // role, status not yet migrated
        },
      ],
      expenses: [
        {
          description: 'Group Cab',
          amount: 1000,
          paidBy: ownerMemberId,
          splitBetween: [ownerMemberId, friendMemberId],
          date: new Date(),
          personalShareAmount: 500,
          personalTransactionId: personalTxId,
          // createdBy and personalSync not yet migrated
        },
      ],
      settlements: [
        {
          from: friendMemberId,
          to: ownerMemberId,
          amount: 500,
          date: new Date(),
          // createdBy not yet migrated
        },
      ],
    });

    // Strip out default share structure to simulate legacy database entry
    legacyGroup.share = undefined;

    mockGroups = [legacyGroup];

    // Mock SplitGroup.find to return our in-memory documents
    jest.spyOn(SplitGroup, 'find').mockImplementation(() => Promise.resolve(mockGroups));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('migrates legacy split groups by populating roles, statuses, createdBy, and personalSync', async () => {
    const group = mockGroups[0];
    const saveSpy = jest.spyOn(group, 'save').mockResolvedValue(group);

    const result = await migrateSplitGroups({ quiet: true });

    expect(result.totalGroups).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(saveSpy).toHaveBeenCalledTimes(1);

    // Verify owner member
    const ownerMember = group.members.id(ownerMemberId);
    expect(ownerMember.role).toBe('owner');
    expect(ownerMember.status).toBe('active');
    expect(ownerMember.userId.toString()).toBe(creatorId.toString());

    // Verify friend member
    const friendMember = group.members.id(friendMemberId);
    expect(friendMember.role).toBe('member');
    expect(friendMember.status).toBe('active');

    // Verify share object
    expect(group.share).toBeDefined();
    expect(group.share.enabled).toBe(false);
    expect(group.share.token).toBeNull();

    // Verify expense
    const exp = group.expenses[0];
    expect(exp.createdBy.toString()).toBe(creatorId.toString());
    expect(exp.personalSync).toHaveLength(1);
    expect(exp.personalSync[0].userId.toString()).toBe(creatorId.toString());
    expect(exp.personalSync[0].amount).toBe(500);
    expect(exp.personalSync[0].transactionId.toString()).toBe(personalTxId.toString());

    // Verify settlement
    const set = group.settlements[0];
    expect(set.createdBy.toString()).toBe(creatorId.toString());
  });

  test('is idempotent: running a second time makes no modifications', async () => {
    const group = mockGroups[0];
    const saveSpy = jest.spyOn(group, 'save').mockResolvedValue(group);

    // First migration run
    const firstResult = await migrateSplitGroups({ quiet: true });
    expect(firstResult.updatedCount).toBe(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);

    // Clear call history before second run
    saveSpy.mockClear();

    // Second migration run on already migrated data
    const secondResult = await migrateSplitGroups({ quiet: true });

    expect(secondResult.totalGroups).toBe(1);
    expect(secondResult.updatedCount).toBe(0);
    expect(secondResult.alreadyMigratedCount).toBe(1);
    expect(secondResult.errors).toHaveLength(0);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  test('dryRun flag calculates updates without calling save()', async () => {
    const group = mockGroups[0];
    const saveSpy = jest.spyOn(group, 'save').mockResolvedValue(group);

    const result = await migrateSplitGroups({ dryRun: true, quiet: true });

    expect(result.updatedCount).toBe(1);
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
