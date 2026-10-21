const mongoose = require('mongoose');

const receiptItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 0 },
    price: { type: Number, required: true, min: 0 },
    lowConfidence: { type: Boolean, default: false },
    confidence: { type: Number },
  },
  { _id: true }
);

const receiptResultSchema = new mongoose.Schema(
  {
    vendor: { type: String, default: 'Receipt Expense', trim: true },
    date: { type: String },
    items: [receiptItemSchema],
    subtotal: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    category: { type: String, default: 'Food & Dining' },
    lowConfidenceItems: [{ type: String }],
  },
  { _id: false }
);

const receiptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'SplitGroup', index: true },
    s3Key: { type: String, required: true, index: true },
    s3Bucket: { type: String },
    mimeType: { type: String, default: 'image/jpeg' },
    fileSize: { type: Number },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    result: { type: receiptResultSchema, default: null },
    error: {
      code: { type: String },
      message: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Receipt', receiptSchema);
