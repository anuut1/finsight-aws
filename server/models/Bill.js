const mongoose = require('mongoose');

const billClaimSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    memberId: { type: mongoose.Schema.Types.ObjectId, required: true },
    units: { type: Number, min: 0, default: 1 },
    claimedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const billItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 1, default: 1 },
    price: { type: Number, required: true, min: 0 }, // In Rupees
    claims: [billClaimSchema],
  },
  { _id: true }
);

const billSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'SplitGroup', required: true, index: true },
    title: { type: String, required: true, trim: true, default: 'Itemized Bill' },
    paidBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiptKey: { type: String, trim: true },
    receiptUploadedAt: { type: Date },
    date: { type: Date, default: Date.now },
    category: { type: String, trim: true, default: 'Dining' },
    currency: { type: String, default: 'INR' },
    items: [billItemSchema],
    tax: { type: Number, default: 0, min: 0 }, // In Rupees
    serviceCharge: { type: Number, default: 0, min: 0 }, // In Rupees
    tip: { type: Number, default: 0, min: 0 }, // In Rupees
    discount: { type: Number, default: 0, min: 0 }, // In Rupees
    total: { type: Number, required: true, min: 0 }, // In Rupees
    unclaimedPolicy: {
      type: String,
      enum: ['split_equally', 'host_absorbs'],
      default: 'split_equally',
    },
    nonResponderPolicy: {
      type: String,
      enum: ['split_among_non_responders', 'split_equally', 'host_absorbs'],
      default: 'split_equally',
    },
    status: {
      type: String,
      enum: ['draft', 'review', 'claiming', 'finalized', 'cancelled'],
      default: 'claiming',
      index: true,
    },
    finalizedExpenseId: { type: mongoose.Schema.Types.ObjectId },
    finalizedAt: { type: Date },
    syncPersonal: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Bill', billSchema);
