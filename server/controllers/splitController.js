const crypto = require('crypto');
const SplitGroup = require('../models/SplitGroup');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const UpiDraft = require('../models/UpiDraft');
const Receipt = require('../models/Receipt');
const { generateReceiptViewUrl } = require('../services/s3Service');
const { cleanAndCategorizeExpense } = require('../services/bedrockService');
const { parseBankAlertHeuristics } = require('../services/bankAlertParser');
const {
  findGroupWithAccess,
  canManageMembers,
  canDeleteGroup,
  canEndTrip,
  canAddExpense,
  canAddSettlement,
} = require('../services/splitAccess');
const { sendGroupInviteEmailViaSes } = require('../services/emailService');

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const getMemberName = (group, memberId) => {
  const member = group.members.id(memberId);
  return member ? member.name : 'Unknown';
};

const getOwnerMemberId = (group) => {
  if (group.ownerMemberId && group.members.id(group.ownerMemberId)) {
    return group.ownerMemberId.toString();
  }
  return group.members[0]?._id.toString();
};

const calculateBalances = (group) => {
  const balancesPaise = {};

  group.members.forEach((member) => {
    balancesPaise[member._id.toString()] = 0;
  });

  group.expenses.forEach((expense) => {
    const paidBy = expense.paidBy.toString();
    const participants = expense.splitBetween.map((id) => id.toString());
    if (!participants.length || balancesPaise[paidBy] === undefined) return;

    const totalPaise = Math.round(Number(expense.amount) * 100);
    balancesPaise[paidBy] += totalPaise;

    if (Array.isArray(expense.customShares) && expense.customShares.length > 0) {
      expense.customShares.forEach((cs) => {
        const mId = cs.memberId.toString();
        if (balancesPaise[mId] !== undefined) {
          balancesPaise[mId] -= Math.round(Number(cs.amount) * 100);
        }
      });
    } else {
      const n = participants.length;
      const basePaise = Math.floor(totalPaise / n);
      const remainderPaise = totalPaise % n;

      participants.forEach((memberId, idx) => {
        if (balancesPaise[memberId] !== undefined) {
          const sharePaise = basePaise + (idx < remainderPaise ? 1 : 0);
          balancesPaise[memberId] -= sharePaise;
        }
      });
    }
  });

  group.settlements.forEach((settlement) => {
    const from = settlement.from.toString();
    const to = settlement.to.toString();
    const settlementPaise = Math.round(Number(settlement.amount) * 100);

    if (balancesPaise[from] !== undefined) balancesPaise[from] += settlementPaise;
    if (balancesPaise[to] !== undefined) balancesPaise[to] -= settlementPaise;
  });

  const memberBalances = group.members.map((member) => {
    const memberId = member._id.toString();
    const paise = balancesPaise[memberId] || 0;
    return {
      memberId,
      name: member.name,
      email: member.email,
      userId: member.userId,
      role: member.role || 'member',
      status: member.status || 'active',
      balance: paise / 100,
    };
  });

  const creditors = memberBalances
    .filter((member) => member.balance > 0)
    .map((member) => ({ ...member, balancePaise: Math.round(member.balance * 100) }))
    .sort((a, b) => b.balancePaise - a.balancePaise);
  const debtors = memberBalances
    .filter((member) => member.balance < 0)
    .map((member) => ({ ...member, balancePaise: Math.round(Math.abs(member.balance) * 100) }))
    .sort((a, b) => b.balancePaise - a.balancePaise);

  const simplifiedDebts = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const settlePaise = Math.min(debtors[i].balancePaise, creditors[j].balancePaise);
    if (settlePaise > 0) {
      simplifiedDebts.push({
        from: debtors[i].memberId,
        fromName: debtors[i].name,
        to: creditors[j].memberId,
        toName: creditors[j].name,
        amount: settlePaise / 100,
      });
    }

    debtors[i].balancePaise -= settlePaise;
    creditors[j].balancePaise -= settlePaise;

    if (debtors[i].balancePaise === 0) i += 1;
    if (creditors[j].balancePaise === 0) j += 1;
  }

  return { memberBalances, simplifiedDebts };
};

const serializeGroup = (group, currentUserId = null) => {
  const { memberBalances, simplifiedDebts } = calculateBalances(group);
  const groupObject = group.toObject();
  const ownerMemberId = getOwnerMemberId(group);

  const uIdStr = currentUserId ? currentUserId.toString() : null;
  const isCreator = group.userId && uIdStr && group.userId.toString() === uIdStr;
  const activeMember = uIdStr && group.members
    ? group.members.find((m) => m.userId && m.userId.toString() === uIdStr && m.status === 'active')
    : null;
  const userRole = isCreator || (activeMember && activeMember.role === 'owner')
    ? 'owner'
    : (activeMember ? 'member' : 'stranger');
  const canManage = userRole === 'owner';

  return {
    ...groupObject,
    ownerMemberId,
    userRole,
    canManage,
    expenses: groupObject.expenses.map((expense) => {
      // Isolate personalSync so that a member only sees their own personal transaction info
      const myPersonalSync = uIdStr && Array.isArray(expense.personalSync)
        ? expense.personalSync.find((ps) => ps.userId && ps.userId.toString() === uIdStr)
        : null;

      return {
        ...expense,
        paidByName: getMemberName(group, expense.paidBy),
        splitBetweenNames: expense.splitBetween.map((id) => getMemberName(group, id)),
        // Only expose personalTransactionId if it belongs to current user
        personalTransactionId: myPersonalSync?.transactionId || (isCreator ? expense.personalTransactionId : null),
        personalShareAmount: myPersonalSync?.amount || (isCreator ? expense.personalShareAmount : 0),
        personalSync: myPersonalSync ? [myPersonalSync] : [],
      };
    }),
    settlements: groupObject.settlements.map((settlement) => ({
      ...settlement,
      fromName: getMemberName(group, settlement.from),
      toName: getMemberName(group, settlement.to),
    })),
    memberBalances,
    simplifiedDebts,
  };
};

/**
 * Get groups where current user is the creator OR an active member.
 */
exports.serializeGroup = serializeGroup;

exports.getGroups = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const groups = await SplitGroup.find({
      $or: [
        { userId: currentUserId },
        { 'members.userId': currentUserId, 'members.status': 'active' },
      ],
    }).sort({ updatedAt: -1 });

    return res.json({
      success: true,
      data: groups.map((g) => serializeGroup(g, currentUserId)),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.createGroup = async (req, res) => {
  try {
    const { name, members = [] } = req.body;
    const user = await User.findById(req.user.id);

    if (!name) {
      return res.status(400).json({ success: false, message: 'Group name is required' });
    }

    const cleanMembers = members
      .map((member) => ({
        name: String(member.name || '').trim(),
        email: String(member.email || '').trim(),
        userId: member.userId || undefined,
      }))
      .filter((member) => member.name);

    const userEmail = user?.email?.toLowerCase();
    const matchingUserIndex = cleanMembers.findIndex(
      (member) =>
        (userEmail && member.email.toLowerCase() === userEmail) ||
        member.name.toLowerCase() === 'you'
    );

    if (matchingUserIndex >= 0) {
      cleanMembers[matchingUserIndex] = {
        name: user?.name || cleanMembers[matchingUserIndex].name,
        email: user?.email || cleanMembers[matchingUserIndex].email,
        userId: req.user.id,
        role: 'owner',
        status: 'active',
      };
    } else if (user) {
      cleanMembers.unshift({
        name: user.name,
        email: user.email,
        userId: req.user.id,
        role: 'owner',
        status: 'active',
      });
    }

    if (cleanMembers.length < 2) {
      return res.status(400).json({ success: false, message: 'Add at least two members' });
    }

    const group = new SplitGroup({
      userId: req.user.id,
      name,
      members: cleanMembers,
      expenses: [],
      settlements: [],
    });

    const ownerMember =
      group.members.find((member) => userEmail && member.email === userEmail) || group.members[0];
    group.ownerMemberId = ownerMember._id;

    await group.save();

    return res.status(201).json({ success: true, data: serializeGroup(group, req.user.id) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Add a shared expense with isolated per-member personal budget sync.
 */
exports.addExpense = async (req, res) => {
  try {
    const { groupId } = req.params;
    const {
      description,
      amount,
      paidBy,
      splitBetween = [],
      date,
      category = 'Shared',
      syncPersonal = true,
      receiptKey,
    } = req.body;

    if (!description || !amount || !paidBy || !date || !splitBetween.length) {
      return res.status(400).json({ success: false, message: 'Missing expense details' });
    }

    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (!canAddExpense(access)) {
      return res.status(403).json({ success: false, message: 'Permission denied to add expense' });
    }

    const memberIds = group.members.map((member) => member._id.toString());
    const invalidMember =
      !memberIds.includes(paidBy) || splitBetween.some((memberId) => !memberIds.includes(memberId));

    if (invalidMember) {
      return res.status(400).json({ success: false, message: 'Invalid group member selected' });
    }

    const numericAmount = Number(amount);
    const perMemberShare = roundMoney(numericAmount / splitBetween.length);

    const expense = group.expenses.create({
      description,
      amount: numericAmount,
      paidBy,
      splitBetween,
      date,
      category,
      syncPersonal,
      personalShareAmount: perMemberShare,
      createdBy: req.user.id,
      personalSync: [],
      receiptKey: receiptKey || undefined,
      receiptUploadedAt: receiptKey ? new Date() : undefined,
    });

    // Create personal transaction for EACH participant linked to a user account
    if (syncPersonal && perMemberShare > 0) {
      for (const participantId of splitBetween) {
        const participantMember = group.members.id(participantId);
        if (participantMember && participantMember.userId) {
          try {
            const tx = await Transaction.create({
              userId: participantMember.userId,
              type: 'expense',
              category,
              amount: perMemberShare,
              description: `${description} (${group.name} split share)`,
              date,
              tags: ['split', group.name],
              mood: 'neutral',
              source: 'split',
              splitGroupId: group._id,
              splitExpenseId: expense._id,
            });

            expense.personalSync.push({
              userId: participantMember.userId,
              amount: perMemberShare,
              transactionId: tx._id,
            });

            if (participantMember.userId.toString() === req.user.id.toString()) {
              expense.personalTransactionId = tx._id;
              expense.personalShareAmount = perMemberShare;
            }
          } catch (txErr) {
            console.warn('[PersonalSync] Failed to create transaction for member:', participantMember.userId, txErr.message);
          }
        }
      }
    }

    group.expenses.push(expense);
    await group.save();

    return res.status(201).json({ success: true, data: serializeGroup(group, req.user.id) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.addSettlement = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { from, to, amount, date, note } = req.body;

    if (!from || !to || !amount || !date) {
      return res.status(400).json({ success: false, message: 'Missing settlement details' });
    }

    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const memberIds = group.members.map((member) => member._id.toString());
    if (!memberIds.includes(from) || !memberIds.includes(to) || from === to) {
      return res.status(400).json({ success: false, message: 'Invalid settlement members' });
    }

    if (!canAddSettlement(access, { from, to })) {
      return res.status(403).json({ success: false, message: 'You can only record settlements involving yourself' });
    }

    group.settlements.push({
      from,
      to,
      amount: Number(amount),
      date,
      note,
      createdBy: req.user.id,
    });

    await group.save();
    return res.status(201).json({ success: true, data: serializeGroup(group, req.user.id) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const { group, access } = await findGroupWithAccess(req.params.groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (!canDeleteGroup(access)) {
      return res.status(403).json({ success: false, message: 'Only the group owner can delete this group' });
    }

    const transactionIds = [];
    group.expenses.forEach((expense) => {
      if (expense.personalTransactionId) transactionIds.push(expense.personalTransactionId);
      if (Array.isArray(expense.personalSync)) {
        expense.personalSync.forEach((ps) => {
          if (ps.transactionId) transactionIds.push(ps.transactionId);
        });
      }
    });

    if (transactionIds.length) {
      await Transaction.deleteMany({ _id: { $in: transactionIds } });
    }

    await group.deleteOne();

    return res.json({ success: true, data: group });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getTripSummaryData = (group, currentUserId = null) => {
  const serialized = serializeGroup(group, currentUserId);
  const totalSpend = roundMoney(
    group.expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0)
  );
  const totalMembers = group.members.length || 1;
  const perPersonFairShare = roundMoney(totalSpend / totalMembers);

  const memberContributions = group.members.map((m) => {
    const mId = m._id.toString();
    const paid = roundMoney(
      group.expenses
        .filter((e) => e.paidBy.toString() === mId)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    );
    const balanceInfo = serialized.memberBalances.find((mb) => mb.memberId === mId);
    return {
      memberId: mId,
      name: m.name,
      email: m.email,
      totalPaid: paid,
      netBalance: balanceInfo ? balanceInfo.balance : 0,
    };
  });

  return {
    ...serialized,
    tripSummary: {
      totalSpend,
      expensesCount: group.expenses.length,
      currency: group.currency || 'INR',
      perPersonFairShare,
      memberContributions,
      simplifiedDebts: serialized.simplifiedDebts,
      status: group.tripStatus || 'ended',
      startDate: group.startDate,
      endDate: group.endDate,
    },
  };
};

exports.getActiveTrip = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const activeTrip = await SplitGroup.findOne({
      $or: [
        { userId: currentUserId },
        { 'members.userId': currentUserId, 'members.status': 'active' },
      ],
      isTrip: true,
      tripStatus: 'active',
    });

    if (!activeTrip) {
      return res.json({ success: true, data: null });
    }

    return res.json({ success: true, data: getTripSummaryData(activeTrip, currentUserId) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.startTrip = async (req, res) => {
  try {
    const { name, members = [], currency = 'INR' } = req.body;
    const user = await User.findById(req.user.id);

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Trip name is required' });
    }

    const cleanMembers = members
      .map((member) => ({
        name: String(member.name || '').trim(),
        email: String(member.email || '').trim(),
        userId: member.userId || undefined,
      }))
      .filter((member) => member.name);

    const userEmail = user?.email?.toLowerCase();
    const matchingUserIndex = cleanMembers.findIndex(
      (member) =>
        (userEmail && member.email.toLowerCase() === userEmail) ||
        member.name.toLowerCase() === 'you'
    );

    if (matchingUserIndex >= 0) {
      cleanMembers[matchingUserIndex] = {
        name: user?.name || cleanMembers[matchingUserIndex].name,
        email: user?.email || cleanMembers[matchingUserIndex].email,
        userId: req.user.id,
        role: 'owner',
        status: 'active',
      };
    } else if (user) {
      cleanMembers.unshift({
        name: user.name,
        email: user.email,
        userId: req.user.id,
        role: 'owner',
        status: 'active',
      });
    }

    if (cleanMembers.length < 2) {
      return res.status(400).json({ success: false, message: 'Add at least two members for the trip' });
    }

    // End any previously active trips to prevent state conflicts
    await SplitGroup.updateMany(
      { userId: req.user.id, isTrip: true, tripStatus: 'active' },
      { $set: { tripStatus: 'ended', endDate: new Date() } }
    );

    const tripGroup = new SplitGroup({
      userId: req.user.id,
      name: name.trim(),
      members: cleanMembers,
      expenses: [],
      settlements: [],
      isTrip: true,
      tripStatus: 'active',
      currency: (currency || 'INR').toUpperCase(),
      startDate: new Date(),
    });

    const ownerMember =
      tripGroup.members.find((member) => userEmail && member.email === userEmail) || tripGroup.members[0];
    tripGroup.ownerMemberId = ownerMember._id;

    await tripGroup.save();

    return res.status(201).json({ success: true, data: getTripSummaryData(tripGroup, req.user.id) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.endTrip = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { group, access } = await findGroupWithAccess(groupId, req.user.id);

    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (!canEndTrip(access)) {
      return res.status(403).json({ success: false, message: 'Only the trip host can end this trip' });
    }

    group.tripStatus = 'ended';
    group.endDate = new Date();
    await group.save();

    return res.json({ success: true, data: getTripSummaryData(group, req.user.id) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getTripSummary = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { group, access } = await findGroupWithAccess(groupId, req.user.id);

    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    return res.json({ success: true, data: getTripSummaryData(group, req.user.id) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Invite a member to group by email or friend user ID (Owner only).
 * Tokens are random, hashed at rest, single-use, and expire in 7 days.
 */
exports.inviteMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { email, friendUserId, name } = req.body;

    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (!canManageMembers(access)) {
      return res.status(403).json({ success: false, message: 'Only the group owner can invite members' });
    }

    let targetEmail = '';
    let targetName = name || '';
    let targetUserId = null;

    if (friendUserId) {
      const friendUser = await User.findById(friendUserId);
      if (!friendUser) {
        return res.status(404).json({ success: false, message: 'Friend user not found' });
      }
      targetEmail = friendUser.email.toLowerCase();
      targetName = targetName || friendUser.name;
      targetUserId = friendUser._id;
    } else if (email) {
      targetEmail = email.trim().toLowerCase();
      const existingUser = await User.findOne({ email: targetEmail });
      if (existingUser) {
        targetUserId = existingUser._id;
        targetName = targetName || existingUser.name;
      } else {
        targetName = targetName || targetEmail.split('@')[0];
      }
    } else {
      return res.status(400).json({ success: false, message: 'Please provide an email or friend to invite' });
    }

    // Check if user is already an active member
    const isAlreadyActive = group.members.some(
      (m) =>
        (targetEmail && m.email && m.email.toLowerCase() === targetEmail && m.status === 'active') ||
        (targetUserId && m.userId && m.userId.toString() === targetUserId.toString() && m.status === 'active')
    );
    if (isAlreadyActive) {
      return res.status(400).json({ success: false, message: 'User is already an active member of this group' });
    }

    // Generate secure single-use token (7-day expiry, hashed at rest)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    group.invites.push({
      email: targetEmail,
      token: tokenHash,
      role: 'member',
      invitedBy: req.user.id,
      status: 'pending',
      createdAt: new Date(),
      expiresAt,
    });

    const inviteRecord = group.invites[group.invites.length - 1];

    // Ensure a pending member record exists
    let existingMember = group.members.find(
      (m) =>
        (targetEmail && m.email && m.email.toLowerCase() === targetEmail) ||
        (targetUserId && m.userId && m.userId.toString() === targetUserId.toString())
    );

    if (existingMember) {
      existingMember.status = 'pending';
      if (targetUserId) existingMember.userId = targetUserId;
    } else {
      group.members.push({
        name: targetName,
        email: targetEmail,
        userId: targetUserId || undefined,
        role: 'member',
        status: 'pending',
      });
    }

    await group.save();

    // Send SES invite email
    sendGroupInviteEmailViaSes({
      toEmail: targetEmail,
      inviterName: req.user.name,
      groupName: group.name,
      isTrip: group.isTrip,
      inviteToken: rawToken,
      isRegistered: Boolean(targetUserId),
    }).catch((err) => console.warn('[SES Group Invite] Error:', err.message));

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const inviteLink = `${clientUrl}/splits?invite=${encodeURIComponent(rawToken)}`;

    return res.status(201).json({
      success: true,
      message: 'Invitation sent successfully',
      data: {
        inviteId: inviteRecord._id,
        email: targetEmail,
        rawToken,
        inviteLink,
        expiresAt,
        group: serializeGroup(group, req.user.id),
      },
    });
  } catch (err) {
    console.error('Error inviting member:', err);
    return res.status(500).json({ success: false, message: 'Failed to invite member' });
  }
};

/**
 * List pending group invites for current logged-in user.
 */
exports.getMyPendingInvites = async (req, res) => {
  try {
    const userEmail = (req.user.email || '').toLowerCase();
    const groups = await SplitGroup.find({
      invites: {
        $elemMatch: {
          email: userEmail,
          status: 'pending',
          expiresAt: { $gt: new Date() },
        },
      },
    }).populate('invites.invitedBy', 'name email avatarUrl');

    const pendingInvites = [];
    groups.forEach((group) => {
      const matchingInvites = group.invites.filter(
        (inv) =>
          inv.email === userEmail &&
          inv.status === 'pending' &&
          new Date(inv.expiresAt) > new Date()
      );

      matchingInvites.forEach((inv) => {
        pendingInvites.push({
          inviteId: inv._id,
          groupId: group._id,
          groupName: group.name,
          isTrip: group.isTrip,
          role: inv.role,
          invitedBy: inv.invitedBy?.name || 'Group Owner',
          invitedByEmail: inv.invitedBy?.email,
          createdAt: inv.createdAt,
          expiresAt: inv.expiresAt,
        });
      });
    });

    return res.json({ success: true, data: pendingInvites });
  } catch (err) {
    console.error('Error getting pending invites:', err);
    return res.status(500).json({ success: false, message: 'Failed to load invites' });
  }
};

/**
 * Accept a group invite by inviteId or token.
 */
exports.acceptGroupInvite = async (req, res) => {
  try {
    const { inviteId } = req.params;
    const { token } = req.body || {};
    const userEmail = (req.user.email || '').toLowerCase();

    let group = null;
    let invite = null;

    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
      group = await SplitGroup.findOne({
        'invites.token': tokenHash,
        'invites.status': 'pending',
        'invites.expiresAt': { $gt: new Date() },
      });
      if (group) {
        invite = group.invites.find(
          (inv) => inv.token === tokenHash && inv.status === 'pending'
        );
      }
    }

    if (!group && inviteId) {
      group = await SplitGroup.findOne({
        'invites._id': inviteId,
        'invites.status': 'pending',
        'invites.expiresAt': { $gt: new Date() },
      });
      if (group) {
        invite = group.invites.id(inviteId);
      }
    }

    if (!group || !invite) {
      return res.status(404).json({ success: false, message: 'Invite not found or has expired' });
    }

    // Mark single-use token as accepted
    invite.status = 'accepted';

    // Activate membership in group
    let member = group.members.find(
      (m) =>
        (m.email && m.email.toLowerCase() === userEmail) ||
        (invite.email && m.email && m.email.toLowerCase() === invite.email.toLowerCase()) ||
        (m.userId && m.userId.toString() === req.user.id.toString())
    );

    if (member) {
      member.userId = req.user.id;
      member.status = 'active';
      member.name = req.user.name || member.name;
    } else {
      group.members.push({
        name: req.user.name || invite.email.split('@')[0],
        email: userEmail,
        userId: req.user.id,
        role: 'member',
        status: 'active',
      });
    }

    await group.save();

    return res.json({
      success: true,
      message: `You joined "${group.name}"`,
      data: serializeGroup(group, req.user.id),
    });
  } catch (err) {
    console.error('Error accepting group invite:', err);
    return res.status(500).json({ success: false, message: 'Failed to accept invite' });
  }
};

/**
 * Decline a group invite.
 */
exports.declineGroupInvite = async (req, res) => {
  try {
    const { inviteId } = req.params;
    const { token } = req.body || {};
    const userEmail = (req.user.email || '').toLowerCase();

    let group = null;
    let invite = null;

    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
      group = await SplitGroup.findOne({
        'invites.token': tokenHash,
        'invites.status': 'pending',
      });
      if (group) {
        invite = group.invites.find((inv) => inv.token === tokenHash);
      }
    }

    if (!group && inviteId) {
      group = await SplitGroup.findOne({
        'invites._id': inviteId,
      });
      if (group) {
        invite = group.invites.id(inviteId);
      }
    }

    if (!group || !invite) {
      return res.status(404).json({ success: false, message: 'Invite not found' });
    }

    invite.status = 'declined';

    // Remove pending member entry if it has no expenses or settlements
    const member = group.members.find(
      (m) =>
        (m.email && m.email.toLowerCase() === userEmail) ||
        (invite.email && m.email && m.email.toLowerCase() === invite.email.toLowerCase())
    );

    if (member && member.status === 'pending') {
      const hasHistory =
        group.expenses.some((e) => e.paidBy.toString() === member._id.toString() || e.splitBetween.map((id) => id.toString()).includes(member._id.toString())) ||
        group.settlements.some((s) => s.from.toString() === member._id.toString() || s.to.toString() === member._id.toString());

      if (!hasHistory) {
        group.members.pull(member._id);
      }
    }

    await group.save();

    return res.json({ success: true, message: 'Invite declined' });
  } catch (err) {
    console.error('Error declining group invite:', err);
    return res.status(500).json({ success: false, message: 'Failed to decline invite' });
  }
};

/**
 * Leave a group (Non-owner member only).
 */
exports.leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { group, access } = await findGroupWithAccess(groupId, req.user.id);

    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (access.isOwner) {
      const otherActiveMembers = group.members.filter(
        (m) => m._id.toString() !== access.currentMember?._id.toString() && m.status === 'active'
      );
      if (otherActiveMembers.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'The group owner cannot leave the group while other members are present. You can delete the group instead.',
        });
      }
    }

    if (!access.currentMember) {
      return res.status(404).json({ success: false, message: 'Member record not found' });
    }

    // Verify member has settled balances
    const { memberBalances } = calculateBalances(group);
    const myBalance = memberBalances.find(
      (mb) => mb.memberId === access.currentMember._id.toString()
    );

    if (myBalance && Math.abs(myBalance.balance) > 0.5) {
      return res.status(400).json({
        success: false,
        message: `Please settle your outstanding balance of ₹${Math.abs(myBalance.balance).toFixed(2)} before leaving the group.`,
      });
    }

    access.currentMember.status = 'inactive';
    await group.save();

    return res.json({ success: true, message: 'You have left the group' });
  } catch (err) {
    console.error('Error leaving group:', err);
    return res.status(500).json({ success: false, message: 'Failed to leave group' });
  }
};

/**
 * Remove a member from the group (Owner only).
 */
exports.removeMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const { group, access } = await findGroupWithAccess(groupId, req.user.id);

    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (!canManageMembers(access)) {
      return res.status(403).json({ success: false, message: 'Only the group owner can remove members' });
    }

    const targetMember = group.members.id(memberId);
    if (!targetMember) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    if (targetMember._id.toString() === group.ownerMemberId?.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot remove the group owner' });
    }

    // Check active balance
    const { memberBalances } = calculateBalances(group);
    const mb = memberBalances.find((b) => b.memberId === memberId);
    if (mb && Math.abs(mb.balance) > 0.5) {
      return res.status(400).json({
        success: false,
        message: `Cannot remove member with active balance of ₹${Math.abs(mb.balance).toFixed(2)}. Please settle first.`,
      });
    }

    // If member has no past expense/settlement records, we can remove them cleanly
    const hasHistory =
      group.expenses.some((e) => e.paidBy.toString() === memberId || e.splitBetween.map((id) => id.toString()).includes(memberId)) ||
      group.settlements.some((s) => s.from.toString() === memberId || s.to.toString() === memberId);

    if (!hasHistory) {
      group.members.pull(memberId);
    } else {
      targetMember.status = 'inactive';
    }

    await group.save();

    return res.json({
      success: true,
      message: 'Member removed successfully',
      data: serializeGroup(group, req.user.id),
    });
  } catch (err) {
    console.error('Error removing member:', err);
    return res.status(500).json({ success: false, message: 'Failed to remove member' });
  }
};

exports.getUpiDrafts = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const drafts = await UpiDraft.find({
      tripId: groupId,
      status: { $in: ['pending_assignment', 'poll_created'] },
    }).sort({ createdAt: -1 });

    return res.json({ success: true, data: drafts });
  } catch (err) {
    console.error('Error fetching UPI drafts:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.createUpiDraft = async (req, res) => {
  try {
    const { groupId } = req.params;
    let { amount, rawText, upiRef, merchant, category, date, payerVpa, receiptKey } = req.body;

    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    // If rawText was provided and amount wasn't explicitly given or is 0, parse via heuristics
    if (rawText && (!amount || Number(amount) <= 0)) {
      const parsed = parseBankAlertHeuristics(rawText);
      if (parsed.amount > 0) {
        amount = parsed.amount;
        if (!merchant) merchant = parsed.merchant;
        if (!category && parsed.category) category = parsed.category;
      }
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive amount is required' });
    }

    let cleanMerchant = merchant;
    let finalCategory = category;

    if (!cleanMerchant || !finalCategory) {
      const aiCleaned = await cleanAndCategorizeExpense(rawText || cleanMerchant || `Payment of ${amount}`);
      if (!cleanMerchant) cleanMerchant = aiCleaned.cleanMerchant || 'Shared expense';
      if (!finalCategory) finalCategory = aiCleaned.category || 'Shared';
    }

    const draft = new UpiDraft({
      userId: req.user.id,
      tripId: groupId,
      rawText: rawText || '',
      cleanMerchant: cleanMerchant || 'Shared expense',
      amount: Number(amount) || 0,
      category: finalCategory || 'Shared',
      date: date ? new Date(date) : new Date(),
      upiRef: upiRef || '',
      payerVpa: payerVpa || '',
      status: 'pending_assignment',
      receiptKey: receiptKey || undefined,
      receiptUploadedAt: receiptKey ? new Date() : undefined,
    });

    await draft.save();
    return res.status(201).json({ success: true, data: draft });
  } catch (err) {
    console.error('Error creating UPI draft:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.dismissUpiDraft = async (req, res) => {
  try {
    const { groupId, draftId } = req.params;
    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const draft = await UpiDraft.findOne({ _id: draftId, tripId: groupId });
    if (!draft) {
      return res.status(404).json({ success: false, message: 'UPI draft not found' });
    }

    draft.status = 'dismissed';
    await draft.save();

    return res.json({ success: true, message: 'Draft dismissed', data: draft });
  } catch (err) {
    console.error('Error dismissing UPI draft:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.assignUpiDraft = async (req, res) => {
  try {
    const { groupId, draftId } = req.params;
    const { mode = 'assign', splitBetween, paidBy, question, syncPersonal = true, description, category } = req.body;

    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const draft = await UpiDraft.findOne({ _id: draftId, tripId: groupId });
    if (!draft) {
      return res.status(404).json({ success: false, message: 'UPI draft not found' });
    }

    if (mode === 'dismiss') {
      draft.status = 'dismissed';
      await draft.save();
      return res.json({ success: true, message: 'Draft dismissed', data: draft });
    }

    if (mode === 'poll') {
      const payerId = paidBy || group.ownerMemberId || group.members[0]?._id;
      draft.status = 'poll_created';
      draft.poll = {
        question: question || `Did you share the expense of ₹${draft.amount} at ${draft.cleanMerchant}?`,
        paidBy: payerId,
        options: group.members.map((m) => {
          // If the member is the payer, default them to opted_in
          const isPayer = String(m._id) === String(payerId);
          return {
            memberId: m._id,
            name: m.name,
            status: isPayer ? 'opted_in' : 'pending',
            votedAt: isPayer ? new Date() : undefined,
          };
        }),
        closed: false,
      };
      await draft.save();
      return res.json({ success: true, message: 'Poll created for UPI draft', data: draft });
    }

    // Default 'assign' mode: Pick people
    const payerId = paidBy || group.ownerMemberId || group.members[0]?._id;
    const participants =
      Array.isArray(splitBetween) && splitBetween.length > 0
        ? splitBetween
        : group.members.map((m) => m._id.toString());

    const expenseDesc = description || draft.cleanMerchant;
    const expenseCat = category || draft.category || 'Shared';
    const numericAmount = Number(draft.amount);
    const perMemberShare = roundMoney(numericAmount / participants.length);
    const expenseDate = draft.date || new Date();

    const newExpense = group.expenses.create({
      description: expenseDesc,
      amount: numericAmount,
      paidBy: payerId,
      splitBetween: participants,
      date: expenseDate,
      category: expenseCat,
      syncPersonal,
      personalShareAmount: perMemberShare,
      createdBy: req.user.id,
      personalSync: [],
      receiptKey: draft.receiptKey || undefined,
      receiptUploadedAt: draft.receiptUploadedAt || (draft.receiptKey ? new Date() : undefined),
    });

    // Create isolated personal transaction for EACH participant linked to a user account
    if (syncPersonal && perMemberShare > 0) {
      for (const participantId of participants) {
        const participantMember = group.members.id(participantId);
        if (participantMember && participantMember.userId) {
          try {
            const tx = await Transaction.create({
              userId: participantMember.userId,
              type: 'expense',
              category: expenseCat,
              amount: perMemberShare,
              description: `${expenseDesc} (${group.name} trip share)`,
              date: expenseDate,
              tags: ['split', group.name],
              mood: 'neutral',
              source: 'split',
              splitGroupId: group._id,
              splitExpenseId: newExpense._id,
            });

            newExpense.personalSync.push({
              userId: participantMember.userId,
              amount: perMemberShare,
              transactionId: tx._id,
            });

            if (participantMember.userId.toString() === req.user.id.toString()) {
              newExpense.personalTransactionId = tx._id;
              newExpense.personalShareAmount = perMemberShare;
            }
          } catch (txErr) {
            console.warn('[PersonalSync] Failed to create transaction for member in draft assign:', participantMember.userId, txErr.message);
          }
        }
      }
    }

    group.expenses.push(newExpense);
    await group.save();

    const createdExpense = group.expenses[group.expenses.length - 1];

    draft.status = 'assigned_to_expense';
    draft.assignedExpenseId = createdExpense._id;
    await draft.save();

    return res.json({
      success: true,
      message: 'Draft successfully converted to trip expense',
      data: {
        draft,
        expense: createdExpense,
        group: serializeGroup(group, req.user.id),
      },
    });
  } catch (err) {
    console.error('Error assigning UPI draft:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Opt-in or opt-out of an active draft poll.
 */
exports.respondToDraftPoll = async (req, res) => {
  try {
    const { groupId, draftId } = req.params;
    const { response, memberId } = req.body; // response: 'opt_in' | 'opt_out'

    if (!['opt_in', 'opt_out'].includes(response)) {
      return res.status(400).json({ success: false, message: 'Invalid response. Must be opt_in or opt_out' });
    }

    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const draft = await UpiDraft.findOne({ _id: draftId, tripId: groupId, status: 'poll_created' });
    if (!draft || !draft.poll || draft.poll.closed) {
      return res.status(404).json({ success: false, message: 'Active poll not found for this draft' });
    }

    // Determine target member: either explicitly provided or inferred from req.user.id
    let targetOption = null;
    if (memberId) {
      targetOption = draft.poll.options.find((o) => String(o.memberId) === String(memberId));
    }
    if (!targetOption) {
      const myMember = group.members.find((m) => m.userId && String(m.userId) === String(req.user.id));
      if (myMember) {
        targetOption = draft.poll.options.find((o) => String(o.memberId) === String(myMember._id));
      }
    }

    if (!targetOption) {
      return res.status(400).json({ success: false, message: 'Member not found in poll options' });
    }

    targetOption.status = response === 'opt_in' ? 'opted_in' : 'opted_out';
    targetOption.votedAt = new Date();
    await draft.save();

    return res.json({
      success: true,
      message: `Successfully ${response === 'opt_in' ? 'opted in to' : 'opted out of'} expense`,
      data: draft,
    });
  } catch (err) {
    console.error('Error responding to draft poll:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Close poll and convert draft to expense among opted-in members using integer-paise math.
 */
exports.closeDraftPoll = async (req, res) => {
  try {
    const { groupId, draftId } = req.params;
    const { syncPersonal = true, description, category } = req.body;

    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const draft = await UpiDraft.findOne({ _id: draftId, tripId: groupId, status: 'poll_created' });
    if (!draft || !draft.poll || draft.poll.closed) {
      return res.status(404).json({ success: false, message: 'Active poll not found' });
    }

    // Identify participants: members who opted in
    const optedInMembers = draft.poll.options.filter((o) => o.status === 'opted_in');

    // If nobody opted in, fall back to the payer or creator
    const payerId = draft.poll.paidBy || group.ownerMemberId || group.members[0]?._id;
    let participantIds = optedInMembers.map((o) => String(o.memberId));
    if (participantIds.length === 0) {
      participantIds = [String(payerId)];
    }

    const expenseDesc = description || draft.cleanMerchant;
    const expenseCat = category || draft.category || 'Shared';
    const totalAmount = Number(draft.amount);

    // Integer-paise math:
    // Convert total rupees to integer paise to eliminate floating point imprecision
    const totalPaise = Math.round(totalAmount * 100);
    const n = participantIds.length;
    const basePaisePerPerson = Math.floor(totalPaise / n);
    const remainderPaise = totalPaise % n; // Remainder paise allocated to the first remainderPaise members

    const perMemberShare = roundMoney(totalAmount / n);
    const expenseDate = draft.date || new Date();

    const newExpense = group.expenses.create({
      description: expenseDesc,
      amount: totalAmount,
      paidBy: payerId,
      splitBetween: participantIds,
      date: expenseDate,
      category: expenseCat,
      syncPersonal,
      personalShareAmount: perMemberShare,
      createdBy: req.user.id,
      personalSync: [],
      receiptKey: draft.receiptKey || undefined,
      receiptUploadedAt: draft.receiptUploadedAt || (draft.receiptKey ? new Date() : undefined),
    });

    // Create isolated personal transaction for participants with integer paise share
    if (syncPersonal) {
      for (let idx = 0; idx < participantIds.length; idx++) {
        const participantId = participantIds[idx];
        const memberPaise = basePaisePerPerson + (idx < remainderPaise ? 1 : 0);
        const memberShare = memberPaise / 100;

        const participantMember = group.members.id(participantId);
        if (participantMember && participantMember.userId && memberShare > 0) {
          try {
            const tx = await Transaction.create({
              userId: participantMember.userId,
              type: 'expense',
              category: expenseCat,
              amount: memberShare,
              description: `${expenseDesc} (${group.name} poll share)`,
              date: expenseDate,
              tags: ['split', group.name],
              mood: 'neutral',
              source: 'split',
              splitGroupId: group._id,
              splitExpenseId: newExpense._id,
            });

            newExpense.personalSync.push({
              userId: participantMember.userId,
              amount: memberShare,
              transactionId: tx._id,
            });

            if (String(participantMember.userId) === String(req.user.id)) {
              newExpense.personalTransactionId = tx._id;
              newExpense.personalShareAmount = memberShare;
            }
          } catch (txErr) {
            console.warn('[PersonalSync] Failed to create transaction for member in close poll:', participantMember.userId, txErr.message);
          }
        }
      }
    }

    group.expenses.push(newExpense);
    await group.save();

    const createdExpense = group.expenses[group.expenses.length - 1];

    draft.poll.closed = true;
    draft.poll.closedAt = new Date();
    draft.status = 'assigned_to_expense';
    draft.assignedExpenseId = createdExpense._id;
    await draft.save();

    return res.json({
      success: true,
      message: 'Poll closed and expense successfully created with integer-paise split',
      data: {
        draft,
        expense: createdExpense,
        group: serializeGroup(group, req.user.id),
      },
    });
  } catch (err) {
    console.error('Error closing draft poll:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET /splits/groups/:groupId/receipts/:key/url
 * Returns a short-lived presigned GET URL for a receipt object.
 * Accessible only to active group members (strangers get 404).
 * Validates key format (JPEG/PNG/PDF), prevents path traversal, and ensures key belongs to this group.
 */
exports.getGroupReceiptUrl = async (req, res) => {
  try {
    const { groupId } = req.params;
    let key = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;

    if (!key && req.query.key) {
      key = req.query.key;
    }

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ success: false, message: 'Receipt key is required' });
    }

    // Path traversal check
    if (key.includes('..') || key.includes('\\') || key.startsWith('/')) {
      return res.status(400).json({ success: false, message: 'Invalid receipt key path' });
    }

    // File type validation (JPEG/PNG/PDF)
    const allowedExt = /\.(jpe?g|png|pdf)$/i;
    if (!allowedExt.test(key)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid receipt file type. Only JPEG, PNG, or PDF are allowed.',
      });
    }

    // Member access check via splitAccess (strangers get 404)
    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group || !access.hasAccess) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    // Verify key belongs to this group
    const activeMemberUserIds = (group.members || [])
      .filter((m) => m.userId && m.status === 'active')
      .map((m) => m.userId.toString());
    if (group.userId) {
      activeMemberUserIds.push(group.userId.toString());
    }

    const belongsToExpenses = (group.expenses || []).some((e) => e.receiptKey === key);
    let belongsToGroup = belongsToExpenses;

    if (!belongsToGroup) {
      const draftExists = await UpiDraft.exists({ tripId: group._id, receiptKey: key });
      if (draftExists) belongsToGroup = true;
    }

    if (!belongsToGroup) {
      const receiptDoc = await Receipt.findOne({ s3Key: key });
      if (receiptDoc) {
        if (receiptDoc.tripId && receiptDoc.tripId.toString() === group._id.toString()) {
          belongsToGroup = true;
        } else if (receiptDoc.userId && activeMemberUserIds.includes(receiptDoc.userId.toString())) {
          belongsToGroup = true;
        }
      }
    }

    // Also allow active group members who just uploaded a receipt under their own userId path
    if (!belongsToGroup) {
      const userPrefixMatch = activeMemberUserIds.some((uid) => key.startsWith(`receipts/${uid}/`));
      if (userPrefixMatch) {
        belongsToGroup = true;
      }
    }

    if (!belongsToGroup) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found in this group',
      });
    }

    // Generate short-lived presigned GET URL (15 minutes / 900 seconds)
    const viewUrl = await generateReceiptViewUrl(key, 900);
    if (!viewUrl) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found or unavailable',
      });
    }

    return res.json({
      success: true,
      data: {
        url: viewUrl,
        viewUrl,
        key,
        expiresIn: 900,
        notice: 'Receipt available for 30 days',
      },
    });
  } catch (err) {
    console.error('Error generating group receipt URL:', err.message);
    return res.status(500).json({ success: false, message: 'Could not generate receipt URL' });
  }
};
