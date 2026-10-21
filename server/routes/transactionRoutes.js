const express = require('express');
const multer = require('multer');
const {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  parseQuickAdd,
  parseBankAlertEndpoint,
  scanReceiptEndpoint,
  getDrafts,
  approveDraft,
  approveAllDrafts,
  rejectDraft,
  magicApproveDrafts,
  triggerEodReminder,
} = require('../controllers/transactionController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit (matches Textract sync limit)
  fileFilter: (req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedMimes.includes(mime)) {
      cb(null, true);
    } else if (mime === 'image/heic' || mime === 'image/heif') {
      const err = new Error(
        'HEIC format from iPhones is not supported directly by AWS Textract. Please convert to JPEG or PNG before uploading.'
      );
      err.code = 'UNSUPPORTED_FILE_TYPE';
      cb(err, false);
    } else if (mime === 'image/webp') {
      const err = new Error(
        'WebP format is not supported by AWS Textract. Please upload a JPEG, PNG, or PDF file.'
      );
      err.code = 'UNSUPPORTED_FILE_TYPE';
      cb(err, false);
    } else {
      const err = new Error(
        `Unsupported file type (${file.mimetype}). AWS Textract supports JPEG, PNG, and PDF files.`
      );
      err.code = 'UNSUPPORTED_FILE_TYPE';
      cb(err, false);
    }
  },
});

// Middleware to intercept multer errors (LIMIT_FILE_SIZE, UNSUPPORTED_FILE_TYPE)
const handleReceiptUpload = (req, res, next) => {
  upload.single('receipt')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds the 10MB limit allowed by AWS Textract.',
        });
      }
      return res.status(400).json({
        success: false,
        code: err.code || 'UPLOAD_ERROR',
        message: err.message || 'File upload error',
      });
    }
    next();
  });
};

const { validate, z } = require('../middleware/validate');

const createTransactionSchema = z.object({
  type: z.enum(['expense', 'income'], {
    errorMap: () => ({ message: 'Transaction type must be expense or income' }),
  }),
  category: z.string().trim().min(1, 'Category is required'),
  amount: z.coerce.number().positive('Amount must be a positive number'),
  date: z.union([z.string(), z.date()]).refine((val) => !isNaN(new Date(val).getTime()), {
    message: 'Invalid transaction date',
  }),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  mood: z.enum(['happy', 'neutral', 'stressed']).optional(),
  autoTagTrip: z.boolean().optional(),
  splitGroupId: z.string().optional().nullable(),
  status: z.enum(['confirmed', 'draft']).optional(),
  isDraft: z.boolean().optional(),
  receiptS3Key: z.string().optional(),
  receiptUrl: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const updateTransactionSchema = z.object({
  type: z.enum(['expense', 'income']).optional(),
  category: z.string().trim().min(1).optional(),
  amount: z.coerce.number().positive('Amount must be a positive number').optional(),
  date: z.union([z.string(), z.date()]).refine((val) => !isNaN(new Date(val).getTime()), {
    message: 'Invalid transaction date',
  }).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  mood: z.enum(['happy', 'neutral', 'stressed']).optional(),
  status: z.enum(['confirmed', 'draft']).optional(),
  metadata: z.record(z.any()).optional(),
});

const parseTextSchema = z.object({
  text: z.string().trim().min(1, 'Input text is required'),
  timeZone: z.string().optional(),
  currentDate: z.string().optional(),
});

const approveDraftSchema = z.object({
  category: z.string().optional(),
  amount: z.coerce.number().positive().optional(),
  description: z.string().optional(),
  date: z.string().optional(),
});

// Drafts & EOD Reminders
router.get('/drafts/magic-approve', magicApproveDrafts);
router.post('/drafts/eod-trigger', triggerEodReminder);
router.get('/drafts', getDrafts);
router.post('/drafts/approve-all', approveAllDrafts);
router.patch('/drafts/:id/approve', validate(approveDraftSchema), approveDraft);
router.delete('/drafts/:id', rejectDraft);

// Natural Language Quick Add & Parsers
router.post('/receipt/scan', handleReceiptUpload, scanReceiptEndpoint);
router.post('/quick-add/parse', validate(parseTextSchema), parseQuickAdd);
router.post('/parse-bank-alert', validate(parseTextSchema), parseBankAlertEndpoint);

// CRUD
router.get('/', getTransactions);
router.post('/', validate(createTransactionSchema), createTransaction);
router.put('/:id', validate(updateTransactionSchema), updateTransaction);
router.delete('/:id', deleteTransaction);

module.exports = router;
