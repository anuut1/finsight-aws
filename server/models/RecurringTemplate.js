const mongoose = require('mongoose');

const recurringTemplateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['expense', 'income'], default: 'expense' },
    category: { type: String, required: true, default: 'Bills & Utilities' },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
      default: 'monthly',
    },
    billingDay: { type: Number, min: 1, max: 31, default: 1 },
    nextDueDate: { type: Date, required: true },
    paymentMethod: {
      type: String,
      enum: ['UPI', 'Credit Card', 'Debit Card', 'Auto-Debit', 'Net Banking', 'Cash', 'Other'],
      default: 'UPI',
    },
    status: { type: String, enum: ['active', 'paused'], default: 'active' },
    autoLog: { type: Boolean, default: false },
    lastLoggedAt: { type: Date },
    tags: [{ type: String }],
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RecurringTemplate', recurringTemplateSchema);
