const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Goal = require('../models/Goal');
const mongoose = require('mongoose');

const calculateVariance = (values) => {
  if (!values.length) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return variance;
};

exports.calculateFinancialHealthScore = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

  const [monthlyTx, budgets, goals, last6Months] = await Promise.all([
    Transaction.find({
      userId,
      date: { $gte: monthStart, $lte: monthEnd },
    }),
    Budget.find({ userId, month: month + 1, year }),
    Goal.find({ userId }),
    Transaction.aggregate([
      { $match: { userId: userObjectId } },
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
    ]),
  ]);

  const totalIncome = monthlyTx
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = monthlyTx
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const savings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;
  const savingsRateScore = Math.max(0, Math.min(100, savingsRate));

  let budgetsNotExceededRatio = 1;
  if (budgets.length) {
    const expensesByCategory = monthlyTx
      .filter((t) => t.type === 'expense')
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {});

    const notExceeded = budgets.filter(
      (b) => (expensesByCategory[b.category] || 0) <= b.limit
    ).length;

    budgetsNotExceededRatio = notExceeded / budgets.length;
  }
  const budgetAdherenceScore = budgetsNotExceededRatio * 100;

  let goalProgressScore = 0;
  if (goals.length) {
    const avgProgress =
      goals.reduce((sum, g) => sum + Math.min(1, g.savedAmount / g.targetAmount || 0), 0) /
      goals.length;
    goalProgressScore = avgProgress * 100;
  }

  const monthlyExpensesValues = last6Months
    .map((m) => m.expense)
    .filter((v) => v != null);
  const expenseVariance = calculateVariance(monthlyExpensesValues);
  const maxReasonableVariance =
    monthlyExpensesValues.length > 0
      ? Math.max(...monthlyExpensesValues) ** 2 || 1
      : 1;
  const expenseConsistencyScore =
    100 - Math.min(100, (expenseVariance / maxReasonableVariance) * 100);

  const emergencyBufferRatio =
    totalExpense > 0 ? Math.max(0, savings / (3 * totalExpense)) : 0;
  const emergencyBufferScore = Math.max(
    0,
    Math.min(100, emergencyBufferRatio * 100)
  );

  const score =
    savingsRateScore * 0.35 +
    budgetAdherenceScore * 0.25 +
    goalProgressScore * 0.2 +
    expenseConsistencyScore * 0.1 +
    emergencyBufferScore * 0.1;

  let grade = 'F';
  if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 55) grade = 'C';
  else if (score >= 40) grade = 'D';

  return {
    score: Math.round(score),
    grade,
    breakdown: {
      savingsRateScore: Math.round(savingsRateScore),
      budgetAdherenceScore: Math.round(budgetAdherenceScore),
      goalProgressScore: Math.round(goalProgressScore),
      expenseConsistencyScore: Math.round(expenseConsistencyScore),
      emergencyBufferScore: Math.round(emergencyBufferScore),
    },
    summary: {
      totalIncome,
      totalExpense,
      savings,
    },
  };
};

