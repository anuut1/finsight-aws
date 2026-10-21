const express = require('express');
const {
  register,
  login,
  me,
  getAvatarPresignedUrl,
  updateAvatar,
  resetPassword,
} = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validate, z } = require('../middleware/validate');

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  inviteToken: z.string().trim().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const resetPasswordSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters long'),
});

const avatarPresignSchema = z.object({
  contentType: z.string().optional(),
});

const updateAvatarSchema = z.object({
  s3AvatarKey: z.string().min(1, 's3AvatarKey is required'),
});

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.get('/me', authMiddleware, me);
router.post('/avatar/presigned-url', authMiddleware, validate(avatarPresignSchema), getAvatarPresignedUrl);
router.put('/avatar', authMiddleware, validate(updateAvatarSchema), updateAvatar);

module.exports = router;
