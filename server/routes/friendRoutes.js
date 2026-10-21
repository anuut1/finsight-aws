const express = require('express');
const { rateLimit } = require('express-rate-limit');
const {
  sendFriendRequest,
  getFriends,
  getFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
  getMyInviteCode,
  regenerateMyInviteCode,
} = require('../controllers/friendController');
const { validate, z } = require('../middleware/validate');

const router = express.Router();

const friendWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many friend requests or actions, please try again later.',
  },
});

const sendFriendRequestSchema = z
  .object({
    email: z.string().trim().email('Invalid email address').optional(),
    code: z.string().trim().min(3, 'Friend code too short').optional(),
  })
  .refine((data) => Boolean(data.email || data.code), {
    message: 'Please provide either an email or a friend invite code',
  });

router.get('/', getFriends);
router.get('/requests', getFriendRequests);
router.get('/my-code', getMyInviteCode);
router.post('/my-code/regenerate', friendWriteLimiter, regenerateMyInviteCode);

router.post('/request', friendWriteLimiter, validate(sendFriendRequestSchema), sendFriendRequest);
router.post('/:id/accept', friendWriteLimiter, acceptFriendRequest);
router.post('/:id/decline', friendWriteLimiter, declineFriendRequest);
router.delete('/:id', friendWriteLimiter, removeFriend);
router.post('/:id/block', friendWriteLimiter, blockUser);
router.post('/:id/unblock', friendWriteLimiter, unblockUser);

module.exports = router;
