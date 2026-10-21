const crypto = require('crypto');
const mongoose = require('mongoose');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const SplitGroup = require('../models/SplitGroup');
const { sendFriendInviteEmailViaSes } = require('../services/emailService');

function getPairKey(id1, id2) {
  const sorted = [id1.toString(), id2.toString()].sort();
  return `${sorted[0]}:${sorted[1]}`;
}

/**
 * Send a friend request by exact email or invite code.
 * Preserves privacy: does not reveal whether an email has an account.
 */
exports.sendFriendRequest = async (req, res) => {
  try {
    const { email, code } = req.body;
    const currentUserId = req.user.id;
    const currentUser = await User.findById(currentUserId);

    if (!currentUser) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!email && !code) {
      return res.status(400).json({ success: false, message: 'Please provide an email or friend invite code' });
    }

    let targetUser = null;

    if (code) {
      const normalizedCode = code.trim().toUpperCase();
      targetUser = await User.findOne({ friendCode: normalizedCode });
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'Invalid friend invite code' });
      }
      if (targetUser._id.toString() === currentUserId.toString()) {
        return res.status(400).json({ success: false, message: 'You cannot add yourself as a friend' });
      }
    } else if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail === currentUser.email.toLowerCase()) {
        return res.status(400).json({ success: false, message: 'You cannot add yourself as a friend' });
      }

      targetUser = await User.findOne({ email: normalizedEmail });

      if (!targetUser) {
        // Send SES invite email without leaking whether the account exists
        await sendFriendInviteEmailViaSes({
          toEmail: normalizedEmail,
          inviterName: currentUser.name,
          inviterCode: currentUser.friendCode,
        });

        return res.status(200).json({
          success: true,
          message: 'Friend request sent',
        });
      }
    }

    const pairKey = getPairKey(currentUserId, targetUser._id);
    let friendship = await Friendship.findOne({ pairKey });

    if (friendship) {
      if (friendship.status === 'accepted') {
        return res.status(200).json({
          success: true,
          message: 'You are already friends with this user',
        });
      }

      if (friendship.status === 'blocked') {
        if (friendship.blockedBy?.toString() === currentUserId.toString()) {
          return res.status(400).json({
            success: false,
            message: 'You have blocked this user. Unblock them first.',
          });
        }
        // If blocked by the other user, return generic success to avoid leaking block status
        return res.status(200).json({
          success: true,
          message: 'Friend request sent',
        });
      }

      if (friendship.status === 'pending') {
        // If the other user already sent a request to current user, auto-accept it!
        if (friendship.recipient.toString() === currentUserId.toString()) {
          friendship.status = 'accepted';
          await friendship.save();
          return res.status(200).json({
            success: true,
            message: 'Friend request accepted',
            data: friendship,
          });
        }
        return res.status(200).json({
          success: true,
          message: 'Friend request already sent',
        });
      }

      if (friendship.status === 'declined') {
        friendship.requester = currentUserId;
        friendship.recipient = targetUser._id;
        friendship.status = 'pending';
        friendship.blockedBy = null;
        await friendship.save();
        return res.status(200).json({
          success: true,
          message: 'Friend request sent',
        });
      }
    }

    // Create new pending friendship
    friendship = new Friendship({
      requester: currentUserId,
      recipient: targetUser._id,
      status: 'pending',
    });
    await friendship.save();

    return res.status(201).json({
      success: true,
      message: 'Friend request sent',
      data: friendship,
    });
  } catch (err) {
    console.error('[Friends] Error sending friend request:', err);
    return res.status(500).json({ success: false, message: 'Failed to send friend request' });
  }
};

/**
 * List accepted friends with shared group counts.
 */
exports.getFriends = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const friendships = await Friendship.find({
      $or: [{ requester: currentUserId }, { recipient: currentUserId }],
      status: 'accepted',
    })
      .populate('requester', 'name email avatarUrl friendCode')
      .populate('recipient', 'name email avatarUrl friendCode')
      .sort({ updatedAt: -1 });

    const friendsList = await Promise.all(
      friendships.map(async (f) => {
        const isRequester = f.requester._id.toString() === currentUserId.toString();
        const friendUser = isRequester ? f.recipient : f.requester;

        if (!friendUser) return null;

        // Count shared active split groups or trips
        const sharedGroupsCount = await SplitGroup.countDocuments({
          $and: [
            { 'members.userId': currentUserId, 'members.status': 'active' },
            { 'members.userId': friendUser._id, 'members.status': 'active' },
          ],
        });

        return {
          friendshipId: f._id,
          userId: friendUser._id,
          name: friendUser.name,
          email: friendUser.email,
          avatarUrl: friendUser.avatarUrl,
          friendCode: friendUser.friendCode,
          sharedGroupsCount,
          connectedSince: f.updatedAt,
        };
      })
    );

    const validFriends = friendsList.filter(Boolean);

    return res.status(200).json({
      success: true,
      data: validFriends,
    });
  } catch (err) {
    console.error('[Friends] Error fetching friends:', err);
    return res.status(500).json({ success: false, message: 'Failed to load friends' });
  }
};

/**
 * List incoming and outgoing pending friend requests.
 */
exports.getFriendRequests = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const [incoming, outgoing] = await Promise.all([
      Friendship.find({
        recipient: currentUserId,
        status: 'pending',
      })
        .populate('requester', 'name email avatarUrl friendCode')
        .sort({ createdAt: -1 }),

      Friendship.find({
        requester: currentUserId,
        status: 'pending',
      })
        .populate('recipient', 'name email avatarUrl friendCode')
        .sort({ createdAt: -1 }),
    ]);

    const formattedIncoming = incoming.map((f) => ({
      friendshipId: f._id,
      requester: {
        userId: f.requester?._id,
        name: f.requester?.name,
        email: f.requester?.email,
        avatarUrl: f.requester?.avatarUrl,
        friendCode: f.requester?.friendCode,
      },
      createdAt: f.createdAt,
    }));

    const formattedOutgoing = outgoing.map((f) => ({
      friendshipId: f._id,
      recipient: {
        userId: f.recipient?._id,
        name: f.recipient?.name,
        email: f.recipient?.email,
        avatarUrl: f.recipient?.avatarUrl,
        friendCode: f.recipient?.friendCode,
      },
      createdAt: f.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: {
        incoming: formattedIncoming,
        outgoing: formattedOutgoing,
      },
    });
  } catch (err) {
    console.error('[Friends] Error fetching requests:', err);
    return res.status(500).json({ success: false, message: 'Failed to load friend requests' });
  }
};

/**
 * Accept an incoming friend request.
 */
exports.acceptFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;

    let friendship = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      friendship = await Friendship.findOne({
        _id: id,
        recipient: currentUserId,
        status: 'pending',
      });

      // Fallback: id might be the requester's userId
      if (!friendship) {
        friendship = await Friendship.findOne({
          requester: id,
          recipient: currentUserId,
          status: 'pending',
        });
      }
    }

    if (!friendship) {
      return res.status(404).json({ success: false, message: 'Pending friend request not found' });
    }

    friendship.status = 'accepted';
    await friendship.save();

    return res.status(200).json({
      success: true,
      message: 'Friend request accepted',
      data: friendship,
    });
  } catch (err) {
    console.error('[Friends] Error accepting request:', err);
    return res.status(500).json({ success: false, message: 'Failed to accept friend request' });
  }
};

/**
 * Decline an incoming friend request.
 */
exports.declineFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;

    let friendship = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      friendship = await Friendship.findOne({
        _id: id,
        recipient: currentUserId,
        status: 'pending',
      });

      if (!friendship) {
        friendship = await Friendship.findOne({
          requester: id,
          recipient: currentUserId,
          status: 'pending',
        });
      }
    }

    if (!friendship) {
      return res.status(404).json({ success: false, message: 'Pending friend request not found' });
    }

    friendship.status = 'declined';
    await friendship.save();

    return res.status(200).json({
      success: true,
      message: 'Friend request declined',
    });
  } catch (err) {
    console.error('[Friends] Error declining request:', err);
    return res.status(500).json({ success: false, message: 'Failed to decline friend request' });
  }
};

/**
 * Remove an existing friendship or cancel an outgoing request.
 */
exports.removeFriend = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;

    let friendship = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      friendship = await Friendship.findOne({
        _id: id,
        $or: [{ requester: currentUserId }, { recipient: currentUserId }],
      });

      if (!friendship) {
        const pairKey = getPairKey(currentUserId, id);
        friendship = await Friendship.findOne({ pairKey });
      }
    }

    if (!friendship) {
      return res.status(404).json({ success: false, message: 'Friendship not found' });
    }

    await friendship.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Friend removed successfully',
    });
  } catch (err) {
    console.error('[Friends] Error removing friend:', err);
    return res.status(500).json({ success: false, message: 'Failed to remove friend' });
  }
};

/**
 * Block a user.
 */
exports.blockUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }

    let targetUserId = id;
    let friendship = await Friendship.findById(id);

    if (friendship) {
      targetUserId = friendship.requester.toString() === currentUserId.toString()
        ? friendship.recipient
        : friendship.requester;
    } else {
      const pairKey = getPairKey(currentUserId, id);
      friendship = await Friendship.findOne({ pairKey });
    }

    if (targetUserId.toString() === currentUserId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot block yourself' });
    }

    if (friendship) {
      friendship.status = 'blocked';
      friendship.blockedBy = currentUserId;
      await friendship.save();
    } else {
      friendship = new Friendship({
        requester: currentUserId,
        recipient: targetUserId,
        status: 'blocked',
        blockedBy: currentUserId,
      });
      await friendship.save();
    }

    return res.status(200).json({
      success: true,
      message: 'User blocked',
    });
  } catch (err) {
    console.error('[Friends] Error blocking user:', err);
    return res.status(500).json({ success: false, message: 'Failed to block user' });
  }
};

/**
 * Unblock a previously blocked user.
 */
exports.unblockUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;

    let friendship = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      friendship = await Friendship.findOne({
        _id: id,
        blockedBy: currentUserId,
        status: 'blocked',
      });

      if (!friendship) {
        const pairKey = getPairKey(currentUserId, id);
        friendship = await Friendship.findOne({
          pairKey,
          blockedBy: currentUserId,
          status: 'blocked',
        });
      }
    }

    if (!friendship) {
      return res.status(404).json({ success: false, message: 'Blocked user record not found' });
    }

    await friendship.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'User unblocked',
    });
  } catch (err) {
    console.error('[Friends] Error unblocking user:', err);
    return res.status(500).json({ success: false, message: 'Failed to unblock user' });
  }
};

/**
 * Retrieve current user's invite code and link.
 */
exports.getMyInviteCode = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.friendCode) {
      user.friendCode = 'FS-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      await user.save();
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const inviteLink = `${clientUrl}/friends?code=${encodeURIComponent(user.friendCode)}`;

    return res.status(200).json({
      success: true,
      data: {
        friendCode: user.friendCode,
        inviteLink,
      },
    });
  } catch (err) {
    console.error('[Friends] Error getting invite code:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve invite code' });
  }
};

/**
 * Regenerate current user's invite code.
 */
exports.regenerateMyInviteCode = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.friendCode = 'FS-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const inviteLink = `${clientUrl}/friends?code=${encodeURIComponent(user.friendCode)}`;

    return res.status(200).json({
      success: true,
      data: {
        friendCode: user.friendCode,
        inviteLink,
      },
    });
  } catch (err) {
    console.error('[Friends] Error regenerating invite code:', err);
    return res.status(500).json({ success: false, message: 'Failed to regenerate invite code' });
  }
};
