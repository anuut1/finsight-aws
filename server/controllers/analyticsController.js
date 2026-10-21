const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const { calculateFinancialHealthScore } = require('../utils/financialHealthScore');

const getCurrentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
};

exports.getSummary = async (req, res) => {
  try {
    const { start, end } = getCurrentMonthRange();

    const tx = await Transaction.find({
      userId: req.user.id,
      status: { $ne: 'draft' },
      date: { $gte: start, $lte: end },
    });

    const totalIncome = tx
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = tx
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const netSavings = totalIncome - totalExpense;

    return res.json({
      success: true,
      data: { totalIncome, totalExpense, netSavings },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getCategoryBreakdown = async (req, res) => {
  try {
    const { start, end } = getCurrentMonthRange();
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);

    const breakdown = await Transaction.aggregate([
      {
        $match: {
          userId: userObjectId,
          type: 'expense',
          status: { $ne: 'draft' },
          date: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
        },
      },
    ]);

    return res.json({
      success: true,
      data: breakdown.map((b) => ({ category: b._id, total: b.total })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getMonthlyTrend = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);

    const trend = await Transaction.aggregate([
      { $match: { userId: userObjectId, status: { $ne: 'draft' } } },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
          income: {
            $sum: {
              $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0],
            },
          },
          expense: {
            $sum: {
              $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0],
            },
          },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 6 },
    ]);

    const formatted = trend
      .map((t) => ({
        year: t._id.year,
        month: t._id.month,
        income: t.income,
        expense: t.expense,
      }))
      .sort((a, b) => a.year - b.year || a.month - b.month);

    return res.json({ success: true, data: formatted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getHealthScore = async (req, res) => {
  try {
    const result = await calculateFinancialHealthScore(req.user.id);
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getSubscriptions = async (req, res) => {
  try {
    const since = new Date();
    since.setMonth(since.getMonth() - 6);

    const tx = await Transaction.find({
      userId: req.user.id,
      type: 'expense',
      status: { $ne: 'draft' },
      date: { $gte: since },
    });

    const groups = {};

    tx.forEach((t) => {
      const key = (t.description || '').trim().toLowerCase();
      if (!key) return;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(t);
    });

    const subscriptions = Object.entries(groups)
      .map(([description, items]) => {
        if (items.length < 2) return null;
        const amounts = items.map((i) => i.amount);
        const avg =
          amounts.reduce((sum, a) => sum + a, 0) / (amounts.length || 1);
        const withinRange = amounts.every(
          (a) => Math.abs(a - avg) / avg <= 0.1
        );
        if (!withinRange) return null;

        return {
          description,
          estimatedMonthlyCost: Math.round(avg),
          occurrences: items.length,
        };
      })
      .filter(Boolean);

    return res.json({ success: true, data: subscriptions });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getSpendingPattern = async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);

    const pattern = await Transaction.aggregate([
      {
        $match: {
          userId: userObjectId,
          type: 'expense',
          status: { $ne: 'draft' },
        },
      },
      {
        $group: {
          _id: { $dayOfWeek: '$date' },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    const dayNames = {
      1: 'Sunday',
      2: 'Monday',
      3: 'Tuesday',
      4: 'Wednesday',
      5: 'Thursday',
      6: 'Friday',
      7: 'Saturday',
    };

    const formatted = pattern.map((p) => ({
      day: dayNames[p._id],
      total: p.total,
    }));

    return res.json({ success: true, data: formatted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

