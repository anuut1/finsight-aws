const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

exports.getBudgets = async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const year = Number(req.query.year) || now.getFullYear();

    const budgets = await Budget.find({ userId: req.user.id, month, year });
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const expenses = await Transaction.aggregate([
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
          spent: { $sum: '$amount' },
        },
      },
    ]);

    const spentByCategory = expenses.reduce((acc, e) => {
      acc[e._id] = e.spent;
      return acc;
    }, {});

    const enriched = budgets.map((b) => ({
      ...b.toObject(),
      spent: spentByCategory[b.category] || 0,
    }));

    return res.json({ success: true, data: enriched });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.createBudget = async (req, res) => {
  try {
    const now = new Date();
    const { category, limit, month = now.getMonth() + 1, year = now.getFullYear() } = req.body;

    if (!category || !limit) {
      return res.status(400).json({ success: false, message: 'Category and limit are required' });
    }

    const budget = await Budget.findOneAndUpdate(
      {
        userId: req.user.id,
        category,
        month,
        year,
      },
      { limit },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({ success: true, data: budget });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.updateBudget = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit } = req.body;

    const budget = await Budget.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { limit },
      { new: true }
    );

    if (!budget) {
      return res.status(404).json({ success: false, message: 'Budget not found' });
    }

    return res.json({ success: true, data: budget });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.deleteBudget = async (req, res) => {
  try {
    const { id } = req.params;

    const budget = await Budget.findOneAndDelete({ _id: id, userId: req.user.id });

    if (!budget) {
      return res.status(404).json({ success: false, message: 'Budget not found' });
    }

    return res.json({ success: true, data: budget });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

