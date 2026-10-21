const express = require('express');
const {
  getRecurringTemplates,
  createRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
  logRecurringPayment,
  initStarterPresets,
} = require('../controllers/recurringController');
const { validate, z } = require('../middleware/validate');

const router = express.Router();

const createRecurringSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  amount: z.coerce.number().positive('Amount must be positive'),
  type: z.enum(['expense', 'income']).optional(),
  category: z.string().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  billingDay: z.coerce.number().int().min(1).max(31).optional(),
  nextDueDate: z.union([z.string(), z.date()]).optional(),
  paymentMethod: z.string().optional(),
  autoLog: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  note: z.string().optional(),
});

const updateRecurringSchema = z.object({
  name: z.string().trim().min(1).optional(),
  amount: z.coerce.number().positive().optional(),
  type: z.enum(['expense', 'income']).optional(),
  category: z.string().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  billingDay: z.coerce.number().int().min(1).max(31).optional(),
  nextDueDate: z.union([z.string(), z.date()]).optional(),
  status: z.enum(['active', 'paused', 'cancelled']).optional(),
  paymentMethod: z.string().optional(),
  autoLog: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  note: z.string().optional(),
});

router.get('/', getRecurringTemplates);
router.post('/', validate(createRecurringSchema), createRecurringTemplate);
router.post('/presets', initStarterPresets);
router.put('/:id', validate(updateRecurringSchema), updateRecurringTemplate);
router.delete('/:id', deleteRecurringTemplate);
router.post('/:id/log', logRecurringPayment);

module.exports = router;
