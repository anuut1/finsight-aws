const mongoose = require('mongoose');

const splitMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['owner', 'member'], default: 'member' },
    status: { type: String, enum: ['pending', 'active', 'inactive', 'left'], default: 'active' },
  },
  { _id: true }
);

const personalSyncSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, min: 0, default: 0 },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  },
  { _id: false }
);

const customShareSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, required: true },
    amount: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const splitExpenseSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    paidBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    splitBetween: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
    date: { type: Date, required: true },
    category: { type: String, trim: true, default: 'Shared' },
    syncPersonal: { type: Boolean, default: true },
    personalShareAmount: { type: Number, min: 0, default: 0 },
    personalTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    personalSync: [personalSyncSchema],
    customShares: [customShareSchema],
    receiptKey: { type: String, trim: true },
    receiptUploadedAt: { type: Date },
  },
  { timestamps: true }
);

const splitSettlementSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, required: true },
    to: { type: mongoose.Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    note: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const splitGroupInviteSchema = new mongoose.Schema(
  {
    email: { type: String, trim: true, lowercase: true },
    token: { type: String, sparse: true, index: true },
    role: { type: String, enum: ['member'], default: 'member' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'expired'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
  },
  { _id: true }
);

const splitShareSchema = new mongoose.Schema(
  {
    token: { type: String, default: null },
    enabled: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
  },
  { _id: false }
);

const splitGroupSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    ownerMemberId: { type: mongoose.Schema.Types.ObjectId },
    members: [splitMemberSchema],
    expenses: [splitExpenseSchema],
    settlements: [splitSettlementSchema],
    invites: [splitGroupInviteSchema],
    share: { type: splitShareSchema, default: () => ({ enabled: false, token: null, expiresAt: null }) },
    isTrip: { type: Boolean, default: false },
    tripStatus: { type: String, enum: ['active', 'ended'], default: 'active' },
    currency: { type: String, default: 'INR' },
    startDate: { type: Date },
    endDate: { type: Date },
  },
  { timestamps: true }
);

splitGroupSchema.index(
  { 'share.token': 1 },
  { unique: true, partialFilterExpression: { 'share.token': { $type: 'string' } } }
);

module.exports = mongoose.model('SplitGroup', splitGroupSchema);
