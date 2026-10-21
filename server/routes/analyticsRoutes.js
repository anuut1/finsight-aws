const express = require('express');
const {
  getSummary,
  getCategoryBreakdown,
  getMonthlyTrend,
  getHealthScore,
  getSubscriptions,
  getSpendingPattern,
} = require('../controllers/analyticsController');

const router = express.Router();

router.get('/summary', getSummary);
router.get('/category-breakdown', getCategoryBreakdown);
router.get('/monthly-trend', getMonthlyTrend);
router.get('/health-score', getHealthScore);
router.get('/subscriptions', getSubscriptions);
router.get('/spending-pattern', getSpendingPattern);

module.exports = router;

