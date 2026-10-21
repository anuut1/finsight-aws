const Bill = require('../models/Bill');
const Transaction = require('../models/Transaction');
const { findGroupWithAccess } = require('../services/splitAccess');
const { serializeGroup } = require('./splitController');
const {
  calculateBillSplit,
  validateBillTotals,
  toPaise,
} = require('../services/billCalculator');
const { sendBillPublishedEmailViaSes } = require('../services/emailService');

/**
 * Format breakdown for client response by converting integer paise to decimal numbers
 */
function formatBreakdownForClient(breakdown) {
  if (!breakdown) return null;
  const formattedShares = {};
  if (breakdown.shares) {
    Object.keys(breakdown.shares).forEach((mId) => {
      const mb = breakdown.shares[mId];
      formattedShares[mId] = {
        ...mb,
        itemsSubtotal: mb.itemsSubtotal / 100,
        subtotal: mb.subtotal / 100,
        unclaimedShare: mb.unclaimedShare / 100,
        taxShare: mb.taxShare / 100,
        serviceChargeShare: mb.serviceChargeShare / 100,
        tipShare: mb.tipShare / 100,
        discountShare: mb.discountShare / 100,
        total: mb.totalShare / 100,
        totalShare: mb.totalShare / 100,
      };
    });
  }

  const formattedSharesList = (breakdown.sharesList || []).map((mb) => ({
    ...mb,
    itemsSubtotal: mb.itemsSubtotal / 100,
    subtotal: mb.subtotal / 100,
    unclaimedShare: mb.unclaimedShare / 100,
    taxShare: mb.taxShare / 100,
    serviceChargeShare: mb.serviceChargeShare / 100,
    tipShare: mb.tipShare / 100,
    discountShare: mb.discountShare / 100,
    total: mb.totalShare / 100,
    totalShare: mb.totalShare / 100,
  }));

  return {
    ...breakdown,
    itemsTotal: breakdown.itemsTotal / 100,
    tax: breakdown.tax / 100,
    serviceCharge: breakdown.serviceCharge / 100,
    tip: breakdown.tip / 100,
    discount: breakdown.discount / 100,
    total: breakdown.total / 100,
    unclaimedTotal: (breakdown.unclaimedTotal || 0) / 100,
    unclaimedAmount: (breakdown.unclaimedTotal || 0) / 100,
    shares: formattedShares,
    sharesList: formattedSharesList,
    memberBreakdown: formattedShares, // Alias for backward/client compatibility
  };
}

/**
 * Helper to build calculateBillSplit input from a Bill document and SplitGroup
 */
function buildCalculatorInput(bill, group, overrides = {}) {
  const memberList = (group.members || []).map((m) => ({
    id: m._id.toString(),
    userId: m.userId ? m.userId.toString() : null,
    name: m.name,
    email: m.email,
  }));

  const itemsList = (bill.items || []).map((it) => ({
    id: it._id.toString(),
    name: it.name,
    qty: it.qty,
    price: toPaise(it.price),
    claims: (it.claims || []).map((c) => ({
      claimantId: c.memberId ? c.memberId.toString() : c.userId?.toString(),
      units: c.units,
    })),
  }));

  return {
    paidBy: bill.paidBy.toString(),
    members: memberList,
    items: itemsList,
    tax: toPaise(bill.tax),
    serviceCharge: toPaise(bill.serviceCharge),
    tip: toPaise(bill.tip),
    discount: toPaise(bill.discount),
    total: toPaise(bill.total),
    unclaimedPolicy: overrides.unclaimedPolicy || bill.unclaimedPolicy || 'split_equally',
    nonResponders: (overrides.nonResponders || []).map(String),
    nonResponderPolicy: overrides.nonResponderPolicy || bill.nonResponderPolicy || 'split_equally',
    assignments: overrides.assignments || [],
  };
}

/**
 * POST /splits/groups/:groupId/bills
 * Creates and publishes a new itemized bill for the group.
 */
exports.createBill = async (req, res) => {
  try {
    const { groupId } = req.params;
    const {
      title,
      paidBy,
      items = [],
      tax = 0,
      serviceCharge = 0,
      tip = 0,
      discount = 0,
      total,
      unclaimedPolicy = 'split_equally',
      nonResponderPolicy = 'split_equally',
      receiptKey,
      date,
      category = 'Dining',
      syncPersonal = true,
    } = req.body;

    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    // Verify paidBy is a valid member of this group
    const memberIds = group.members.map((m) => m._id.toString());
    if (!paidBy || !memberIds.includes(paidBy.toString())) {
      return res.status(400).json({ success: false, message: 'Invalid or missing paidBy member' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one line item is required' });
    }

    // Validate item shapes
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.name || !it.name.trim()) {
        return res.status(400).json({ success: false, message: `Item #${i + 1} must have a name` });
      }
      if (it.qty !== undefined && Number(it.qty) <= 0) {
        return res.status(400).json({ success: false, message: `Item #${i + 1} quantity must be at least 1` });
      }
      if (it.price !== undefined && Number(it.price) < 0) {
        return res.status(400).json({ success: false, message: `Item #${i + 1} price cannot be negative` });
      }
    }

    // Validate totals in integer paise
    const billPaise = {
      items: items.map((it) => ({ ...it, price: toPaise(it.price) })),
      tax: toPaise(tax),
      serviceCharge: toPaise(serviceCharge),
      tip: toPaise(tip),
      discount: toPaise(discount),
      total: total !== undefined && total !== null ? toPaise(total) : undefined,
    };

    const totalsValidation = validateBillTotals(billPaise);
    if (!totalsValidation.isValid && Math.abs(totalsValidation.discrepancy) > 1) {
      return res.status(400).json({
        success: false,
        message: `Line items and charges do not match total: calculated ₹${(totalsValidation.calculatedTotal / 100).toFixed(2)} vs provided ₹${(totalsValidation.providedTotal / 100).toFixed(2)}`,
        details: totalsValidation,
      });
    }

    // Key format validation if receiptKey is attached
    if (receiptKey) {
      if (receiptKey.includes('..') || receiptKey.startsWith('/') || receiptKey.startsWith('\\')) {
        return res.status(400).json({ success: false, message: 'Invalid receipt key path' });
      }
      const extMatch = receiptKey.toLowerCase().match(/\.(jpe?g|png|pdf)$/);
      if (!extMatch) {
        return res.status(400).json({ success: false, message: 'Invalid receipt key format' });
      }
    }

    const calculatedTotalRupees = totalsValidation.calculatedTotal / 100;

    const newBill = new Bill({
      groupId: group._id,
      title: (title || 'Itemized Bill').trim(),
      paidBy,
      createdBy: req.user.id,
      receiptKey: receiptKey || undefined,
      receiptUploadedAt: receiptKey ? new Date() : undefined,
      date: date ? new Date(date) : new Date(),
      category: category.trim(),
      currency: group.currency || 'INR',
      items: items.map((it) => ({
        name: it.name.trim(),
        qty: Math.max(1, Math.round(Number(it.qty) || 1)),
        price: Number(it.price) || 0,
        claims: [],
      })),
      tax: Number(tax) || 0,
      serviceCharge: Number(serviceCharge) || 0,
      tip: Number(tip) || 0,
      discount: Number(discount) || 0,
      total: calculatedTotalRupees,
      unclaimedPolicy,
      nonResponderPolicy,
      status: 'claiming',
      syncPersonal: Boolean(syncPersonal),
    });

    await newBill.save();

    // Asynchronously notify members via SES
    const hostMember = group.members.find((m) => m.userId && m.userId.toString() === req.user.id.toString());
    const hostName = hostMember?.name || 'A group member';
    group.members.forEach((m) => {
      if (m.email && m.status === 'active' && (!m.userId || m.userId.toString() !== req.user.id.toString())) {
        sendBillPublishedEmailViaSes({
          toEmail: m.email,
          hostName,
          groupName: group.name,
          billTitle: newBill.title,
          billTotal: newBill.total,
        }).catch((err) => {
          console.warn('[BillNotification] SES email warning:', err.message);
        });
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Itemized bill published for claiming',
      data: newBill,
    });
  } catch (err) {
    console.error('Error creating bill:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET /splits/groups/:groupId/bills
 * List all active/historical bills for the group.
 */
exports.getBills = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const bills = await Bill.find({
      groupId: group._id,
      status: { $ne: 'cancelled' },
    }).sort({ createdAt: -1 });

    return res.json({ success: true, data: bills });
  } catch (err) {
    console.error('Error fetching bills:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET /splits/groups/:groupId/bills/:billId
 * Retrieves specific bill with live split calculation and current member's personal share.
 */
exports.getBillById = async (req, res) => {
  try {
    const { groupId, billId } = req.params;
    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const bill = await Bill.findOne({ _id: billId, groupId: group._id });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const calcInput = buildCalculatorInput(bill, group);
    const breakdown = calculateBillSplit(calcInput);
    const formattedBreakdown = formatBreakdownForClient(breakdown);

    // Current member's running share
    const myMemberId = access.currentMember?._id?.toString();
    const myMemberShare = myMemberId && formattedBreakdown.memberBreakdown
      ? formattedBreakdown.memberBreakdown[myMemberId]
      : null;

    return res.json({
      success: true,
      data: {
        bill,
        breakdown: formattedBreakdown,
        myShare: myMemberShare,
      },
    });
  } catch (err) {
    console.error('Error retrieving bill:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * POST /splits/groups/:groupId/bills/:billId/claim
 * Allows the authenticated group member to claim or unclaim items (or units).
 * SECURITY: Only updates claims for req.user.id and access.currentMember._id.
 */
exports.claimBillItems = async (req, res) => {
  try {
    const { groupId, billId } = req.params;
    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const bill = await Bill.findOne({ _id: billId, groupId: group._id });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    if (bill.status === 'finalized' || bill.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Bill is ${bill.status} and cannot be modified`,
      });
    }

    const currentMember = access.currentMember;
    if (!currentMember) {
      return res.status(403).json({ success: false, message: 'Only active group members can claim items' });
    }

    const myMemberIdStr = currentMember._id.toString();
    const myUserIdStr = req.user.id.toString();

    // Payload can be either a single claim: { itemId, units } or batch claims: { claims: [{ itemId, units }] }
    let claimUpdates = [];
    if (Array.isArray(req.body.claims)) {
      claimUpdates = req.body.claims;
    } else if (req.body.itemId) {
      claimUpdates = [{ itemId: req.body.itemId, units: req.body.units }];
    } else {
      return res.status(400).json({ success: false, message: 'Missing claim details' });
    }

    // Apply claims
    claimUpdates.forEach(({ itemId, units }) => {
      const item = bill.items.id(itemId);
      if (!item) return;

      const numericUnits = units !== undefined && units !== null ? Math.max(0, Number(units)) : 0;

      // Filter out current user's existing claim on this item
      item.claims = (item.claims || []).filter(
        (c) =>
          c.memberId?.toString() !== myMemberIdStr &&
          c.userId?.toString() !== myUserIdStr
      );

      // If units > 0, record new claim
      if (numericUnits > 0) {
        item.claims.push({
          userId: req.user.id,
          memberId: currentMember._id,
          units: Math.min(numericUnits, item.qty),
          claimedAt: new Date(),
        });
      }
    });

    await bill.save();

    // Recalculate breakdown
    const calcInput = buildCalculatorInput(bill, group);
    const breakdown = calculateBillSplit(calcInput);
    const formattedBreakdown = formatBreakdownForClient(breakdown);
    const myMemberShare = formattedBreakdown.memberBreakdown
      ? formattedBreakdown.memberBreakdown[myMemberIdStr]
      : null;

    return res.json({
      success: true,
      message: 'Item claims updated',
      data: {
        bill,
        breakdown: formattedBreakdown,
        myShare: myMemberShare,
      },
    });
  } catch (err) {
    console.error('Error claiming bill items:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * POST /splits/groups/:groupId/bills/:billId/finalize
 * Host / payer closes claiming and creates the finalized expense in group.expenses.
 * IDEMPOTENT: If already finalized, returns existing expense and serialized group without duplicates.
 */
exports.finalizeBill = async (req, res) => {
  try {
    const { groupId, billId } = req.params;
    const {
      unclaimedPolicy,
      nonResponders = [],
      nonResponderPolicy,
      assignments = [],
    } = req.body;

    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const bill = await Bill.findOne({ _id: billId, groupId: group._id });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    // Idempotent: return existing expense if already finalized
    if (bill.status === 'finalized' && bill.finalizedExpenseId) {
      const existingExpense = group.expenses.id(bill.finalizedExpenseId);
      return res.json({
        success: true,
        message: 'Bill was already finalized',
        data: {
          bill,
          expense: existingExpense,
          group: serializeGroup(group, req.user.id),
        },
      });
    }

    // Authorization: owner, creator, or payer
    const isOwner = access.isOwner;
    const isCreator = bill.createdBy && bill.createdBy.toString() === req.user.id.toString();
    const isPayer = access.currentMember && bill.paidBy.toString() === access.currentMember._id.toString();

    if (!isOwner && !isCreator && !isPayer) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: Only the host or payer can finalize this bill',
      });
    }

    // Apply policy overrides if provided
    if (unclaimedPolicy) {
      bill.unclaimedPolicy = unclaimedPolicy;
    }
    if (nonResponderPolicy) {
      bill.nonResponderPolicy = nonResponderPolicy;
    }

    // Run final calculation
    const calcInput = buildCalculatorInput(bill, group, {
      unclaimedPolicy: bill.unclaimedPolicy,
      nonResponders,
      nonResponderPolicy: bill.nonResponderPolicy,
      assignments,
    });

    const breakdown = calculateBillSplit(calcInput);

    // Determine participants with total share > 0
    const participantMemberIds = Object.keys(breakdown.shares || {}).filter(
      (mId) => (breakdown.shares[mId]?.totalShare || 0) > 0
    );

    const expenseParticipants = participantMemberIds.length > 0
      ? participantMemberIds
      : [bill.paidBy.toString()];

    const expenseDate = bill.date || new Date();
    const totalRupees = breakdown.total / 100;

    const customSharesList = expenseParticipants.map((mId) => ({
      memberId: mId,
      amount: (breakdown.shares[mId]?.totalShare || 0) / 100,
    }));

    const newExpense = group.expenses.create({
      description: bill.title,
      amount: totalRupees,
      paidBy: bill.paidBy,
      splitBetween: expenseParticipants,
      date: expenseDate,
      category: bill.category || 'Dining',
      syncPersonal: bill.syncPersonal !== false,
      personalShareAmount: 0,
      createdBy: req.user.id,
      personalSync: [],
      customShares: customSharesList,
      receiptKey: bill.receiptKey || undefined,
      receiptUploadedAt: bill.receiptUploadedAt || (bill.receiptKey ? new Date() : undefined),
    });

    // Create isolated personal transactions with exact calculated integer paise shares
    if (bill.syncPersonal !== false) {
      for (const mId of expenseParticipants) {
        const memberSharePaise = breakdown.shares[mId]?.totalShare || 0;
        const memberShareRupees = memberSharePaise / 100;
        const member = group.members.id(mId);

        if (member && member.userId && memberShareRupees > 0) {
          try {
            const tx = await Transaction.create({
              userId: member.userId,
              type: 'expense',
              category: bill.category || 'Dining',
              amount: memberShareRupees,
              description: `${bill.title} (${group.name} itemized share)`,
              date: expenseDate,
              tags: ['split', group.name, 'itemized-bill'],
              mood: 'neutral',
              source: 'split',
              splitGroupId: group._id,
              splitExpenseId: newExpense._id,
            });

            newExpense.personalSync.push({
              userId: member.userId,
              amount: memberShareRupees,
              transactionId: tx._id,
            });

            if (member.userId.toString() === req.user.id.toString()) {
              newExpense.personalTransactionId = tx._id;
              newExpense.personalShareAmount = memberShareRupees;
            }
          } catch (txErr) {
            console.warn('[PersonalSync] Failed creating transaction for member in finalize bill:', member.userId, txErr.message);
          }
        }
      }
    }

    group.expenses.push(newExpense);
    await group.save();

    const createdExpense = group.expenses[group.expenses.length - 1];

    // Lock bill edits and mark finalized
    bill.status = 'finalized';
    bill.finalizedExpenseId = createdExpense._id;
    bill.finalizedAt = new Date();
    await bill.save();

    return res.json({
      success: true,
      message: 'Bill finalized into group expense',
      data: {
        bill,
        expense: createdExpense,
        group: serializeGroup(group, req.user.id),
      },
    });
  } catch (err) {
    console.error('Error finalizing bill:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * POST /splits/groups/:groupId/bills/:billId/cancel
 * Cancels an unfinalized bill.
 */
exports.cancelBill = async (req, res) => {
  try {
    const { groupId, billId } = req.params;
    const { group, access } = await findGroupWithAccess(groupId, req.user.id);
    if (!group) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const bill = await Bill.findOne({ _id: billId, groupId: group._id });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    if (bill.status === 'finalized') {
      return res.status(400).json({ success: false, message: 'Cannot cancel an already finalized bill' });
    }

    const isOwner = access.isOwner;
    const isCreator = bill.createdBy && bill.createdBy.toString() === req.user.id.toString();
    if (!isOwner && !isCreator) {
      return res.status(403).json({ success: false, message: 'Permission denied to cancel this bill' });
    }

    bill.status = 'cancelled';
    await bill.save();

    return res.json({
      success: true,
      message: 'Bill cancelled',
      data: bill,
    });
  } catch (err) {
    console.error('Error cancelling bill:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
