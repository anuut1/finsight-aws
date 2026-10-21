const express = require('express');
const {
  getGroups,
  createGroup,
  addExpense,
  addSettlement,
  deleteGroup,
  getActiveTrip,
  startTrip,
  endTrip,
  getTripSummary,
  getUpiDrafts,
  createUpiDraft,
  assignUpiDraft,
  dismissUpiDraft,
  respondToDraftPoll,
  closeDraftPoll,
  inviteMember,
  getMyPendingInvites,
  acceptGroupInvite,
  declineGroupInvite,
  leaveGroup,
  removeMember,
  getGroupReceiptUrl,
} = require('../controllers/splitController');
const {
  createBill,
  getBills,
  getBillById,
  claimBillItems,
  finalizeBill,
  cancelBill,
} = require('../controllers/billController');
const { validate, z } = require('../middleware/validate');
const { rateLimit } = require('express-rate-limit');

const router = express.Router();

const billActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required'),
  members: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Member name is required'),
        email: z.string().trim().optional(),
        userId: z.string().optional(),
      })
    )
    .optional(),
});

const addExpenseSchema = z.object({
  description: z.string().trim().min(1, 'Expense description is required'),
  amount: z.coerce.number().positive('Expense amount must be positive'),
  paidBy: z.string().min(1, 'Paid by member is required'),
  splitBetween: z.array(z.string()).min(1, 'At least one participant required'),
  date: z.union([z.string(), z.date()]).refine((val) => !isNaN(new Date(val).getTime()), {
    message: 'Invalid expense date',
  }),
  category: z.string().optional(),
  syncPersonal: z.boolean().optional(),
  receiptKey: z.string().trim().optional(),
});

const addSettlementSchema = z.object({
  from: z.string().min(1, 'From member is required'),
  to: z.string().min(1, 'To member is required'),
  amount: z.coerce.number().positive('Settlement amount must be positive'),
  date: z.union([z.string(), z.date()]).refine((val) => !isNaN(new Date(val).getTime()), {
    message: 'Invalid settlement date',
  }),
  note: z.string().optional(),
});

const startTripSchema = z.object({
  name: z.string().trim().min(1, 'Trip name is required'),
  members: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Member name is required'),
        email: z.string().trim().optional(),
        userId: z.string().optional(),
      })
    )
    .optional(),
  currency: z.string().optional(),
});

const createUpiDraftSchema = z
  .object({
    amount: z.coerce.number().positive('Draft amount must be positive').optional(),
    rawText: z.string().optional(),
    upiRef: z.string().optional(),
    merchant: z.string().optional(),
    category: z.string().optional(),
    date: z.union([z.string(), z.date()]).optional(),
    payerVpa: z.string().optional(),
    receiptKey: z.string().trim().optional(),
  })
  .refine((data) => Boolean(data.amount || (data.rawText && data.rawText.trim())), {
    message: 'Either amount or rawText is required',
  });

const inviteMemberSchema = z
  .object({
    email: z.string().trim().email('Invalid email address').optional(),
    friendUserId: z.string().optional(),
    name: z.string().trim().optional(),
  })
  .refine((data) => Boolean(data.email || data.friendUserId), {
    message: 'Must provide either an email or friendUserId',
  });

const createBillSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').optional(),
  paidBy: z.string().min(1, 'paidBy member is required'),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Item name is required'),
        qty: z.coerce.number().positive().default(1),
        price: z.coerce.number().min(0, 'Item price cannot be negative'),
      })
    )
    .min(1, 'At least one line item is required'),
  tax: z.coerce.number().min(0).optional(),
  serviceCharge: z.coerce.number().min(0).optional(),
  tip: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).optional(),
  total: z.coerce.number().min(0).optional(),
  unclaimedPolicy: z.enum(['split_equally', 'host_absorbs']).optional(),
  nonResponderPolicy: z.enum(['split_among_non_responders', 'split_equally', 'host_absorbs']).optional(),
  receiptKey: z.string().trim().optional(),
  date: z.union([z.string(), z.date()]).optional(),
  category: z.string().optional(),
  syncPersonal: z.boolean().optional(),
});

const claimBillSchema = z.object({
  itemId: z.string().optional(),
  units: z.coerce.number().min(0).optional(),
  claims: z
    .array(
      z.object({
        itemId: z.string().min(1),
        units: z.coerce.number().min(0),
      })
    )
    .optional(),
});

const finalizeBillSchema = z.object({
  unclaimedPolicy: z.enum(['split_equally', 'host_absorbs']).optional(),
  nonResponders: z.array(z.string()).optional(),
  nonResponderPolicy: z.enum(['split_among_non_responders', 'split_equally', 'host_absorbs']).optional(),
  assignments: z
    .array(
      z.object({
        itemId: z.string().min(1),
        claimantId: z.string().min(1),
        units: z.coerce.number().min(0),
      })
    )
    .optional(),
});

router.get('/trips/active', getActiveTrip);
router.post('/trips/start', validate(startTripSchema), startTrip);
router.post('/trips/:groupId/end', endTrip);
router.get('/trips/:groupId/summary', getTripSummary);

// Pending group invites for current user
router.get('/invites/pending', getMyPendingInvites);
router.post('/invites/:inviteId/accept', acceptGroupInvite);
router.post('/invites/:inviteId/decline', declineGroupInvite);

router.get('/groups', getGroups);
router.post('/groups', validate(createGroupSchema), createGroup);
router.delete('/groups/:groupId', deleteGroup);
router.post('/groups/:groupId/expenses', validate(addExpenseSchema), addExpense);
router.post('/groups/:groupId/settlements', validate(addSettlementSchema), addSettlement);

// Member management
router.post('/groups/:groupId/invites', validate(inviteMemberSchema), inviteMember);
router.post('/groups/:groupId/leave', leaveGroup);
router.delete('/groups/:groupId/members/:memberId', removeMember);

// Trip-mode UPI Drafts & Polls
router.get('/groups/:groupId/upi-drafts', getUpiDrafts);
router.post('/groups/:groupId/upi-drafts', validate(createUpiDraftSchema), createUpiDraft);
router.post('/groups/:groupId/upi-drafts/:draftId/assign', assignUpiDraft);
router.post('/groups/:groupId/upi-drafts/:draftId/dismiss', dismissUpiDraft);
router.post('/groups/:groupId/upi-drafts/:draftId/poll/respond', respondToDraftPoll);
router.post('/groups/:groupId/upi-drafts/:draftId/poll/close', closeDraftPoll);

// Itemized Bills ("Split by Items")
router.get('/groups/:groupId/bills', billActionLimiter, getBills);
router.post('/groups/:groupId/bills', billActionLimiter, validate(createBillSchema), createBill);
router.get('/groups/:groupId/bills/:billId', billActionLimiter, getBillById);
router.post('/groups/:groupId/bills/:billId/claim', billActionLimiter, validate(claimBillSchema), claimBillItems);
router.post('/groups/:groupId/bills/:billId/finalize', billActionLimiter, validate(finalizeBillSchema), finalizeBill);
router.post('/groups/:groupId/bills/:billId/cancel', billActionLimiter, cancelBill);

// Trip receipts presigned view URL (active members only)
router.get(
  ['/groups/:groupId/receipts/:key/url', '/groups/:groupId/receipts/*key/url'],
  getGroupReceiptUrl
);

module.exports = router;
