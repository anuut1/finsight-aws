const Transaction = require('../models/Transaction');
const SplitGroup = require('../models/SplitGroup');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { parseNaturalLanguageInput } = require('../services/quickAddParser');
const { parseBankAlert } = require('../services/bankAlertParser');
const { analyzeReceiptExpense } = require('../services/textractService');
const {
  sendEodReminderForUser,
  sweepAllUsersForEodReminders,
} = require('../services/eodReminderService');
const { logger } = require('../utils/logger');
const { syncTransactionSubscription, sendUpcomingSubscriptionReminders } = require('../services/subscriptionService');

exports.getTransactions = async (req, res) => {
  try {
    const { type, category, startDate, endDate, status, page = 1, limit = 10 } = req.query;
    const query = { userId: req.user.id };

    if (status === 'draft') {
      query.status = 'draft';
    } else if (status !== 'all') {
      query.status = { $ne: 'draft' };
    }

    if (type) query.type = type;
    if (category) query.category = category;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      Transaction.find(query).sort({ date: -1 }).skip(skip).limit(safeLimit),
      Transaction.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: {
        items,
        pagination: {
          total,
          page: safePage,
          limit: safeLimit,
          pages: Math.ceil(total / safeLimit) || 1,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.createTransaction = async (req, res) => {
  try {
    const {
      type,
      category,
      amount,
      description,
      date,
      tags = [],
      mood = 'neutral',
      autoTagTrip = true,
      splitGroupId,
      status = 'confirmed',
      isDraft = false,
      receiptS3Key = '',
      receiptUrl = '',
      metadata = {},
    } = req.body;

    if (!type || !category || !amount || !date) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const finalStatus = isDraft || status === 'draft' ? 'draft' : 'confirmed';
    let finalTags = Array.isArray(tags) ? [...tags] : [];
    let finalSplitGroupId = splitGroupId;
    let source = 'manual';
    let currency = 'INR';
    let activeTrip = null;

    if (autoTagTrip !== false && !finalSplitGroupId) {
      activeTrip = await SplitGroup.findOne({
        userId: req.user.id,
        isTrip: true,
        tripStatus: 'active',
      });

      if (activeTrip) {
        finalSplitGroupId = activeTrip._id;
        source = 'trip';
        currency = activeTrip.currency || 'INR';
        if (!finalTags.includes('trip')) finalTags.push('trip');
        if (!finalTags.includes(activeTrip.name)) finalTags.push(activeTrip.name);
      }
    }

    const transaction = await Transaction.create({
      userId: req.user.id,
      type,
      category,
      amount,
      description,
      date,
      tags: finalTags,
      mood,
      source,
      currency,
      splitGroupId: finalSplitGroupId,
      status: finalStatus,
      receiptS3Key,
      receiptUrl,
      metadata,
    });

    // If an active trip exists and this is an expense, automatically sync as a trip expense split among preset members
    if (finalStatus === 'confirmed' && activeTrip && type === 'expense' && activeTrip.members?.length) {
      try {
        const memberIds = activeTrip.members.map((m) => m._id);
        const ownerId = activeTrip.ownerMemberId || memberIds[0];
        const numericAmount = Number(amount);
        const personalShare =
          Math.round(((numericAmount / memberIds.length) + Number.EPSILON) * 100) / 100;

        const tripExpense = activeTrip.expenses.create({
          description: description || `${category} expense`,
          amount: numericAmount,
          paidBy: ownerId,
          splitBetween: memberIds,
          date,
          category,
          syncPersonal: false, // Already created personal transaction above
          personalShareAmount: personalShare,
          personalTransactionId: transaction._id,
        });

        activeTrip.expenses.push(tripExpense);
        await activeTrip.save();

        transaction.splitExpenseId = tripExpense._id;
        await transaction.save();
      } catch (tripSyncErr) {
        console.warn('Could not auto-add expense to active trip:', tripSyncErr.message);
      }
    }

    // Automatically detect recurring subscription (Netflix, Spotify, etc.) and schedule next due date
    let subscriptionDetected = null;
    if (finalStatus === 'confirmed' && type === 'expense') {
      subscriptionDetected = await syncTransactionSubscription({
        userId: req.user.id,
        description: description || transaction.description,
        amount,
        date: transaction.date,
        category: transaction.category,
        paymentMethod: finalTags.includes('card') ? 'Credit Card' : 'UPI',
      });
    }

    return res.status(201).json({
      success: true,
      data: transaction,
      subscriptionDetected,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await Transaction.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      req.body,
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    return res.json({ success: true, data: transaction });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await Transaction.findOneAndDelete({
      _id: id,
      userId: req.user.id,
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    return res.json({ success: true, data: transaction });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.parseQuickAdd = async (req, res) => {
  try {
    const { text, timeZone, currentDate } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Input text is required' });
    }

    const parsed = await parseNaturalLanguageInput(text, {
      timeZone,
      currentDate,
      user: req.user,
    });

    return res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('Quick add parsing error:', err);
    return res.status(500).json({ success: false, message: 'Failed to parse natural language input' });
  }
};

exports.parseBankAlertEndpoint = async (req, res) => {
  try {
    const { text, currentDate } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Bank alert or SMS text is required' });
    }

    const parsed = await parseBankAlert(text, {
      currentDate,
      user: req.user,
    });

    return res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('Bank alert parsing error:', err);
    return res.status(500).json({ success: false, message: 'Failed to parse bank alert' });
  }
};

exports.scanReceiptEndpoint = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a receipt file (JPEG, PNG, or PDF up to 10MB)',
      });
    }

    const result = await analyzeReceiptExpense(req.file.buffer, req.file.mimetype);
    return res.json({
      success: true,
      ...result,
      data: result,
    });
  } catch (err) {
    logger.error({ err, mime: req.file?.mimetype }, 'Receipt scan endpoint failed');
    const status = err.statusCode || err.status || 500;
    return res.status(status).json({
      success: false,
      code: err.code || err.name || 'TEXTRACT_ERROR',
      message: err.message || 'Failed to process receipt',
      ...(err.awsRequestId ? { requestId: err.awsRequestId } : {}),
    });
  }
};

exports.getDrafts = async (req, res) => {
  try {
    const drafts = await Transaction.find({
      userId: req.user.id,
      status: 'draft',
    }).sort({ date: -1 });

    const totalAmount = drafts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

    return res.json({
      success: true,
      data: drafts,
      count: drafts.length,
      totalAmount,
    });
  } catch (err) {
    console.error('Error fetching drafts:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch unconfirmed drafts' });
  }
};

exports.approveDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { status: 'confirmed' };
    if (req.body.category) updates.category = req.body.category;
    if (req.body.amount !== undefined) updates.amount = Number(req.body.amount);
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.date) updates.date = req.body.date;

    const transaction = await Transaction.findOneAndUpdate(
      { _id: id, userId: req.user.id, status: 'draft' },
      updates,
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Draft not found or already confirmed' });
    }

    return res.json({
      success: true,
      message: 'Draft approved successfully',
      data: transaction,
    });
  } catch (err) {
    console.error('Error approving draft:', err);
    return res.status(500).json({ success: false, message: 'Failed to approve draft' });
  }
};

exports.approveAllDrafts = async (req, res) => {
  try {
    const result = await Transaction.updateMany(
      { userId: req.user.id, status: 'draft' },
      { status: 'confirmed' }
    );

    return res.json({
      success: true,
      message: `Successfully approved ${result.modifiedCount} draft(s)`,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error('Error approving all drafts:', err);
    return res.status(500).json({ success: false, message: 'Failed to approve drafts' });
  }
};

exports.rejectDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Transaction.findOneAndDelete({
      _id: id,
      userId: req.user.id,
      status: 'draft',
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Draft not found' });
    }

    return res.json({
      success: true,
      message: 'Draft dismissed successfully',
      data: deleted,
    });
  } catch (err) {
    console.error('Error dismissing draft:', err);
    return res.status(500).json({ success: false, message: 'Failed to dismiss draft' });
  }
};

exports.magicApproveDrafts = async (req, res) => {
  try {
    const { token } = req.query;
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    if (!token) {
      return res.status(400).send('<h1>Invalid or missing approval token</h1>');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).send('Server configuration error: JWT_SECRET missing');
    }
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch {
      return res.status(401).send(`
        <!DOCTYPE html>
        <html>
          <body style="background:#0B1020; color:#F8FAFC; font-family: system-ui, sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
            <div style="background:#0F172A; padding:36px; border-radius:16px; border:1px solid #1E293B; text-align:center; max-width:440px;">
              <h2 style="color:#F43F5E; margin-top:0;">Link Expired or Invalid</h2>
              <p style="color:#94A3B8; font-size:15px; line-height:1.6;">This one-tap approval link has expired or has already been used. Please visit FinSight to review your pending drafts.</p>
              <a href="${clientUrl}/dashboard" style="display:inline-block; margin-top:16px; padding:12px 24px; background:#6366F1; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">Open Dashboard</a>
            </div>
          </body>
        </html>
      `);
    }

    const { userId, draftIds } = decoded;
    const filter = {
      userId,
      status: 'draft',
    };
    if (Array.isArray(draftIds) && draftIds.length) {
      filter._id = { $in: draftIds };
    }

    const result = await Transaction.updateMany(filter, { status: 'confirmed' });

    // Redirect to web app with confirmation query params
    return res.redirect(`${clientUrl}/dashboard?drafts_approved=true&count=${result.modifiedCount}`);
  } catch (err) {
    console.error('Magic approve error:', err);
    return res.status(500).send('Server error during approval');
  }
};

exports.triggerEodReminder = async (req, res) => {
  try {
    // If triggered by a logged-in user in the UI, process and return digest for that user
    if (req.user && req.user.id) {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      const result = await sendEodReminderForUser(user);
      return res.json({ success: true, data: result });
    }

    // Otherwise, triggered by EventBridge / Lambda with secret
    if (req.isCronTrigger) {
      const [draftResults, subscriptionResults] = await Promise.all([
        sweepAllUsersForEodReminders(),
        sendUpcomingSubscriptionReminders(3),
      ]);
      return res.json({ success: true, data: { drafts: draftResults, subscriptions: subscriptionResults } });
    }

    return res.status(401).json({ success: false, message: 'Unauthorized trigger' });
  } catch (err) {
    console.error('EOD reminder trigger error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process EOD reminder' });
  }
};


