const mongoose = require('mongoose');
const {
  determineAccess,
  canManageGroup,
  canDeleteGroup,
  canEndTrip,
  canManageShare,
  canManageMembers,
  canAddExpense,
  canModifyExpense,
  canAddSettlement,
} = require('../services/splitAccess');

describe('splitAccess Service — Unit Tests', () => {
  const creatorUserId = new mongoose.Types.ObjectId();
  const memberUserId = new mongoose.Types.ObjectId();
  const anotherMemberUserId = new mongoose.Types.ObjectId();
  const strangerUserId = new mongoose.Types.ObjectId();
  const pendingMemberUserId = new mongoose.Types.ObjectId();

  const ownerMemberId = new mongoose.Types.ObjectId();
  const member1Id = new mongoose.Types.ObjectId();
  const member2Id = new mongoose.Types.ObjectId();
  const pendingMemberId = new mongoose.Types.ObjectId();

  const sampleGroup = {
    _id: new mongoose.Types.ObjectId(),
    userId: creatorUserId,
    name: 'Goa Trip 2026',
    ownerMemberId: ownerMemberId,
    members: [
      {
        _id: ownerMemberId,
        name: 'Creator Host',
        email: 'creator@example.com',
        userId: creatorUserId,
        role: 'owner',
        status: 'active',
      },
      {
        _id: member1Id,
        name: 'Active Member One',
        email: 'member1@example.com',
        userId: memberUserId,
        role: 'member',
        status: 'active',
      },
      {
        _id: member2Id,
        name: 'Active Member Two',
        email: 'member2@example.com',
        userId: anotherMemberUserId,
        role: 'member',
        status: 'active',
      },
      {
        _id: pendingMemberId,
        name: 'Pending Member',
        email: 'pending@example.com',
        userId: pendingMemberUserId,
        role: 'member',
        status: 'pending',
      },
    ],
  };

  describe('determineAccess()', () => {
    test('grants owner access to the group creator', () => {
      const access = determineAccess(sampleGroup, creatorUserId);
      expect(access.hasAccess).toBe(true);
      expect(access.isOwner).toBe(true);
      expect(access.role).toBe('owner');
      expect(access.status).toBe(200);
      expect(access.currentMember._id.toString()).toBe(ownerMemberId.toString());
    });

    test('grants member access to an active member with role="member"', () => {
      const access = determineAccess(sampleGroup, memberUserId);
      expect(access.hasAccess).toBe(true);
      expect(access.isOwner).toBe(false);
      expect(access.role).toBe('member');
      expect(access.status).toBe(200);
      expect(access.currentMember._id.toString()).toBe(member1Id.toString());
    });

    test('returns 404 for a pending member (status="pending") to prevent info leak', () => {
      const access = determineAccess(sampleGroup, pendingMemberUserId);
      expect(access.hasAccess).toBe(false);
      expect(access.status).toBe(404);
      expect(access.currentMember).toBeNull();
    });

    test('returns 404 for an unrelated stranger', () => {
      const access = determineAccess(sampleGroup, strangerUserId);
      expect(access.hasAccess).toBe(false);
      expect(access.isOwner).toBe(false);
      expect(access.role).toBeNull();
      expect(access.status).toBe(404);
    });

    test('returns 404 for missing or null parameters', () => {
      expect(determineAccess(null, creatorUserId).status).toBe(404);
      expect(determineAccess(sampleGroup, null).status).toBe(404);
      expect(determineAccess(null, null).status).toBe(404);
    });

    test('handles legacy group where owner member has not yet had userId backfilled', () => {
      const legacyGroup = {
        _id: new mongoose.Types.ObjectId(),
        userId: creatorUserId,
        ownerMemberId: ownerMemberId,
        members: [
          {
            _id: ownerMemberId,
            name: 'Creator Host',
            email: 'creator@example.com',
            // userId not populated yet
          },
          {
            _id: member1Id,
            name: 'Friend',
            email: 'friend@example.com',
          },
        ],
      };

      const access = determineAccess(legacyGroup, creatorUserId);
      expect(access.hasAccess).toBe(true);
      expect(access.isOwner).toBe(true);
      expect(access.role).toBe('owner');
      expect(access.currentMember._id.toString()).toBe(ownerMemberId.toString());
    });
  });

  describe('Management Permission Helpers', () => {
    const ownerAccess = determineAccess(sampleGroup, creatorUserId);
    const memberAccess = determineAccess(sampleGroup, memberUserId);
    const strangerAccess = determineAccess(sampleGroup, strangerUserId);

    test('canManageGroup: owner can, member and stranger cannot', () => {
      expect(canManageGroup(ownerAccess)).toBe(true);
      expect(canManageGroup(memberAccess)).toBe(false);
      expect(canManageGroup(strangerAccess)).toBe(false);
    });

    test('canDeleteGroup: owner can, member and stranger cannot', () => {
      expect(canDeleteGroup(ownerAccess)).toBe(true);
      expect(canDeleteGroup(memberAccess)).toBe(false);
      expect(canDeleteGroup(strangerAccess)).toBe(false);
    });

    test('canEndTrip: owner can, member and stranger cannot', () => {
      expect(canEndTrip(ownerAccess)).toBe(true);
      expect(canEndTrip(memberAccess)).toBe(false);
      expect(canEndTrip(strangerAccess)).toBe(false);
    });

    test('canManageShare: owner can, member and stranger cannot', () => {
      expect(canManageShare(ownerAccess)).toBe(true);
      expect(canManageShare(memberAccess)).toBe(false);
      expect(canManageShare(strangerAccess)).toBe(false);
    });

    test('canManageMembers: owner can, member and stranger cannot', () => {
      expect(canManageMembers(ownerAccess)).toBe(true);
      expect(canManageMembers(memberAccess)).toBe(false);
      expect(canManageMembers(strangerAccess)).toBe(false);
    });

    test('canAddExpense: both owner and member can, stranger cannot', () => {
      expect(canAddExpense(ownerAccess)).toBe(true);
      expect(canAddExpense(memberAccess)).toBe(true);
      expect(canAddExpense(strangerAccess)).toBe(false);
    });
  });

  describe('canModifyExpense()', () => {
    const ownerAccess = determineAccess(sampleGroup, creatorUserId);
    const member1Access = determineAccess(sampleGroup, memberUserId);
    const member2Access = determineAccess(sampleGroup, anotherMemberUserId);

    const expenseCreatedByMember1 = {
      _id: new mongoose.Types.ObjectId(),
      description: 'Dinner at Beach Cafe',
      amount: 1500,
      createdBy: memberUserId,
    };

    const expenseCreatedByOwner = {
      _id: new mongoose.Types.ObjectId(),
      description: 'Hotel Booking',
      amount: 8000,
      createdBy: creatorUserId,
    };

    test('owner can modify any expense regardless of who created it', () => {
      expect(canModifyExpense(ownerAccess, expenseCreatedByMember1, creatorUserId)).toBe(true);
      expect(canModifyExpense(ownerAccess, expenseCreatedByOwner, creatorUserId)).toBe(true);
    });

    test('member can modify an expense they created', () => {
      expect(canModifyExpense(member1Access, expenseCreatedByMember1, memberUserId)).toBe(true);
    });

    test('member cannot modify an expense created by another member or the owner', () => {
      expect(canModifyExpense(member2Access, expenseCreatedByMember1, anotherMemberUserId)).toBe(false);
      expect(canModifyExpense(member1Access, expenseCreatedByOwner, memberUserId)).toBe(false);
    });

    test('returns false for missing inputs', () => {
      expect(canModifyExpense(null, expenseCreatedByMember1, memberUserId)).toBe(false);
      expect(canModifyExpense(member1Access, null, memberUserId)).toBe(false);
    });
  });

  describe('canAddSettlement()', () => {
    const ownerAccess = determineAccess(sampleGroup, creatorUserId);
    const member1Access = determineAccess(sampleGroup, memberUserId);
    const member2Access = determineAccess(sampleGroup, anotherMemberUserId);

    const settlementBetweenMembers = {
      from: member1Id,
      to: member2Id,
      amount: 500,
    };

    const settlementBetweenOwnerAndMember2 = {
      from: ownerMemberId,
      to: member2Id,
      amount: 1000,
    };

    test('owner can record any settlement', () => {
      expect(canAddSettlement(ownerAccess, settlementBetweenMembers)).toBe(true);
      expect(canAddSettlement(ownerAccess, settlementBetweenOwnerAndMember2)).toBe(true);
    });

    test('member can record a settlement when they are the "from" party', () => {
      expect(canAddSettlement(member1Access, settlementBetweenMembers)).toBe(true);
    });

    test('member can record a settlement when they are the "to" party', () => {
      expect(canAddSettlement(member2Access, settlementBetweenMembers)).toBe(true);
    });

    test('member cannot record a settlement that does not involve themselves', () => {
      // member1 is neither from nor to in this settlement
      expect(canAddSettlement(member1Access, settlementBetweenOwnerAndMember2)).toBe(false);
    });
  });
});
