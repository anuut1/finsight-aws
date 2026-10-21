const mongoose = require('mongoose');

const upiDraftSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'SplitGroup', index: true },
    rawText: { type: String, trim: true },
    cleanMerchant: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, default: 'Other' },
    date: { type: Date, default: Date.now },
    upiRef: { type: String, trim: true, index: true },
    payerVpa: { type: String, trim: true },
    status: {
      type: String,
      enum: ['pending_assignment', 'assigned_to_expense', 'poll_created', 'dismissed'],
      default: 'pending_assignment',
      index: true,
    },
    assignedExpenseId: { type: mongoose.Schema.Types.ObjectId },
    poll: {
      question: { type: String },
      paidBy: { type: mongoose.Schema.Types.ObjectId },
      options: [
        {
          memberId: { type: mongoose.Schema.Types.ObjectId },
          name: { type: String },
          status: { type: String, enum: ['opted_in', 'opted_out', 'pending'], default: 'pending' },
          votedAt: { type: Date },
        },
      ],
      closed: { type: Boolean, default: false },
      closedAt: { type: Date },
    },
    receiptKey: { type: String, trim: true },
    receiptUploadedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UpiDraft', upiDraftSchema);
