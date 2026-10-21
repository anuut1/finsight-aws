const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'blocked'],
      default: 'pending',
      index: true,
    },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pairKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  { timestamps: true }
);

friendshipSchema.pre('validate', function () {
  if (this.requester && this.recipient) {
    const reqStr = this.requester.toString();
    const recStr = this.recipient.toString();
    if (reqStr === recStr) {
      throw new Error('Cannot friend yourself');
    }
    const sorted = [reqStr, recStr].sort();
    this.pairKey = `${sorted[0]}:${sorted[1]}`;
  }
});

friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ recipient: 1, status: 1 });

module.exports = mongoose.model('Friendship', friendshipSchema);
