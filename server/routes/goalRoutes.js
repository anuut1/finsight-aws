const express = require('express');
const { getGoals, createGoal, updateGoal, deleteGoal } = require('../controllers/goalController');
const { validate, z } = require('../middleware/validate');

const router = express.Router();

const createGoalSchema = z.object({
  title: z.string().trim().min(1, 'Goal title is required'),
  targetAmount: z.coerce.number().positive('Target amount must be a positive number'),
  savedAmount: z.coerce.number().min(0, 'Saved amount cannot be negative').optional(),
  deadline: z.union([z.string(), z.date()]).refine((val) => !isNaN(new Date(val).getTime()), {
    message: 'Invalid deadline date',
  }),
});

const updateGoalSchema = z.object({
  title: z.string().trim().min(1).optional(),
  targetAmount: z.coerce.number().positive().optional(),
  savedAmount: z.coerce.number().min(0).optional(),
  deadline: z.union([z.string(), z.date()]).refine((val) => !isNaN(new Date(val).getTime()), {
    message: 'Invalid deadline date',
  }).optional(),
  status: z.enum(['active', 'completed']).optional(),
});

router.get('/', getGoals);
router.post('/', validate(createGoalSchema), createGoal);
router.put('/:id', validate(updateGoalSchema), updateGoal);
router.delete('/:id', deleteGoal);

module.exports = router;

