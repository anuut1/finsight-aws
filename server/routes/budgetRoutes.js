const express = require('express');
const {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
} = require('../controllers/budgetController');
const { validate, z } = require('../middleware/validate');

const router = express.Router();

const createBudgetSchema = z.object({
  category: z.string().trim().min(1, 'Category is required'),
  limit: z.coerce.number().positive('Limit must be a positive number'),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).optional(),
});

const updateBudgetSchema = z.object({
  limit: z.coerce.number().positive('Limit must be a positive number'),
});

router.get('/', getBudgets);
router.post('/', validate(createBudgetSchema), createBudget);
router.put('/:id', validate(updateBudgetSchema), updateBudget);
router.delete('/:id', deleteBudget);

module.exports = router;

