const SplitGroup = require('../models/SplitGroup');

/**
 * Split Group Access Control Service
 * Centralizes permission checks for all split group & trip operations.
 *
 * Access Rules:
 * - A user can access a group if they are the creator OR an active member with matching userId.
 * - Owner: Everything (delete group, end trip, manage members, manage share link).
 * - Member: View, add expenses, edit/delete only expenses they created, record settlements involving themselves.
 * - Everyone else: 404 (always returns 404 to avoid leaking group existence).
 */

/**
 * Determines access permissions for a given group document and userId.
 *
 * @param {Object} group - Mongoose document or plain object of SplitGroup
 * @param {string|mongoose.Types.ObjectId} userId - Authenticated user's ID
 * @returns {Object} Access summary
 */
function determineAccess(group, userId) {
  if (!group || !userId) {
    return {
      hasAccess: false,
      isOwner: false,
      role: null,
      currentMember: null,
      status: 404,
      message: 'Group not found',
    };
  }

  const uIdStr = userId.toString();
  const creatorIdStr = group.userId ? group.userId.toString() : null;

  // 1. Is user the creator of the group?
  const isCreator = creatorIdStr === uIdStr;

  // 2. Find matching member record in group.members
  let currentMember = null;
  if (Array.isArray(group.members)) {
    // Priority: matching userId with active status
    currentMember = group.members.find(
      (m) => m.userId && m.userId.toString() === uIdStr && m.status === 'active'
    );

    // If not found, check if user is the creator and matches ownerMemberId or first member
    if (!currentMember && isCreator) {
      if (group.ownerMemberId) {
        currentMember = group.members.find(
          (m) => m._id && m._id.toString() === group.ownerMemberId.toString()
        );
      }
      if (!currentMember && group.members.length > 0) {
        currentMember = group.members[0];
      }
    }
  }

  // 3. Determine if user has active membership
  const isActiveMember = Boolean(
    group.members &&
      group.members.some(
        (m) => m.userId && m.userId.toString() === uIdStr && m.status === 'active'
      )
  );

  // If user is neither creator nor active member -> 404 (not found / no permission)
  if (!isCreator && !isActiveMember) {
    return {
      hasAccess: false,
      isOwner: false,
      role: null,
      currentMember: null,
      status: 404,
      message: 'Group not found',
    };
  }

  // Role resolution: owner if creator or member with role='owner'
  const isOwner = isCreator || (currentMember && currentMember.role === 'owner');
  const role = isOwner ? 'owner' : 'member';

  return {
    hasAccess: true,
    isOwner,
    role,
    currentMember,
    status: 200,
  };
}

/**
 * Finds a group by ID and validates user access in one call.
 *
 * @param {string|mongoose.Types.ObjectId} groupId
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<{ group: SplitGroup|null, access: Object }>}
 */
async function findGroupWithAccess(groupId, userId) {
  if (!groupId || !userId) {
    return {
      group: null,
      access: { hasAccess: false, status: 404, message: 'Group not found' },
    };
  }

  const group = await SplitGroup.findById(groupId);
  if (!group) {
    return {
      group: null,
      access: { hasAccess: false, status: 404, message: 'Group not found' },
    };
  }

  const access = determineAccess(group, userId);
  if (!access.hasAccess) {
    return { group: null, access };
  }

  return { group, access };
}

/**
 * Permissions checks
 */
function canManageGroup(access) {
  return Boolean(access && access.hasAccess && access.isOwner);
}

function canDeleteGroup(access) {
  return canManageGroup(access);
}

function canEndTrip(access) {
  return canManageGroup(access);
}

function canManageShare(access) {
  return canManageGroup(access);
}

function canManageMembers(access) {
  return canManageGroup(access);
}

function canAddExpense(access) {
  return Boolean(access && access.hasAccess);
}

/**
 * Checks whether user can modify or delete a given expense.
 * Owner can modify any expense; members can only modify expenses they created.
 */
function canModifyExpense(access, expense, userId) {
  if (!access || !access.hasAccess || !expense) return false;
  if (access.isOwner) return true;

  const currentUserIdStr = (userId || access.userId)?.toString();
  if (!currentUserIdStr) return false;

  // Expense creator match
  if (expense.createdBy && expense.createdBy.toString() === currentUserIdStr) {
    return true;
  }

  return false;
}

/**
 * Checks whether user can record a settlement.
 * Owner can record any settlement; member can only record settlements that involve themselves.
 */
function canAddSettlement(access, settlement) {
  if (!access || !access.hasAccess || !settlement) return false;
  if (access.isOwner) return true;

  if (!access.currentMember || !access.currentMember._id) return false;
  const currentMemberIdStr = access.currentMember._id.toString();

  const fromStr = settlement.from ? settlement.from.toString() : '';
  const toStr = settlement.to ? settlement.to.toString() : '';

  return fromStr === currentMemberIdStr || toStr === currentMemberIdStr;
}

module.exports = {
  determineAccess,
  findGroupWithAccess,
  canManageGroup,
  canDeleteGroup,
  canEndTrip,
  canManageShare,
  canManageMembers,
  canAddExpense,
  canModifyExpense,
  canAddSettlement,
};
