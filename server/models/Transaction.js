const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    category: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
    date: { type: Date, required: true },
    tags: [{ type: String }],
    mood: { type: String, enum: ['happy', 'neutral', 'stressed'], default: 'neutral' },
    source: { type: String, enum: ['manual', 'split', 'trip'], default: 'manual' },
    splitGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'SplitGroup' },
    splitExpenseId: { type: mongoose.Schema.Types.ObjectId },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['confirmed', 'draft'], default: 'confirmed' },
    receiptS3Key: { type: String, default: '' },
    receiptUrl: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);

