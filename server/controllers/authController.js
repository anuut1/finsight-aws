const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SplitGroup = require('../models/SplitGroup');
const {
  recordAuthAuditLogToS3,
  generateAvatarUploadUrl,
  generateAvatarViewUrl,
} = require('../services/s3Service');
const { sendWelcomeEmailViaSes } = require('../services/emailService');
const dynamoService = require('../services/dynamoService');

const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is missing.');
  }
  return jwt.sign({ id: userId }, secret, { expiresIn: '7d' });
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, inviteToken } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already in use' });
    }

    const clientIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      password,
      lastLoginAt: new Date(),
      lastLoginIp: clientIp,
    });
    await user.save();

    // Auto-accept group invite if inviteToken is present or if pending invite exists for this email
    try {
      let groupToJoin = null;
      let matchingInvite = null;

      if (inviteToken) {
        const tokenHash = crypto.createHash('sha256').update(inviteToken.trim()).digest('hex');
        groupToJoin = await SplitGroup.findOne({
          'invites.token': tokenHash,
          'invites.status': 'pending',
          'invites.expiresAt': { $gt: new Date() },
        });
        if (groupToJoin) {
          matchingInvite = groupToJoin.invites.find(
            (inv) => inv.token === tokenHash && inv.status === 'pending'
          );
        }
      }

      if (!groupToJoin) {
        groupToJoin = await SplitGroup.findOne({
          'invites.email': normalizedEmail,
          'invites.status': 'pending',
          'invites.expiresAt': { $gt: new Date() },
        });
        if (groupToJoin) {
          matchingInvite = groupToJoin.invites.find(
            (inv) => inv.email === normalizedEmail && inv.status === 'pending'
          );
        }
      }

      if (groupToJoin && matchingInvite) {
        matchingInvite.status = 'accepted';
        let member = groupToJoin.members.find(
          (m) => m.email && m.email.toLowerCase() === normalizedEmail
        );
        if (member) {
          member.userId = user._id;
          member.status = 'active';
          member.name = user.name || member.name;
        } else {
          groupToJoin.members.push({
            name: user.name,
            email: normalizedEmail,
            userId: user._id,
            role: 'member',
            status: 'active',
          });
        }
        await groupToJoin.save();
      }
    } catch (e) {
      console.warn('[Auto-accept Invite] Error:', e.message);
    }

    // 1. Record registration event directly in AWS S3 audit logs
    recordAuthAuditLogToS3({
      event: 'REGISTER',
      userId: user._id,
      email: user.email,
      ip: clientIp,
      userAgent,
    }).catch((err) => console.warn('[AWS S3 Audit] Error:', err.message));

    // 2. Dual-write user & account creation event to Amazon DynamoDB
    dynamoService
      .putUser(user)
      .then(() =>
        dynamoService.logActivity({
          userId: user._id.toString(),
          action: 'ACCOUNT_CREATED',
          details: { name: user.name, email: user.email },
          ip: clientIp,
          userAgent,
        })
      )
      .catch((dynErr) => console.warn('[DynamoDB Register] Warning:', dynErr.message));

    // 3. Send welcome email via Amazon SES
    sendWelcomeEmailViaSes({
      toEmail: user.email,
      userName: user.name,
    }).catch((err) => console.warn('[AWS SES Welcome] Error:', err.message));

    const token = generateToken(user._id);

    return res.status(201).json({
      success: true,
      data: {
        user,
        token,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'Email already in use' });
    }
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const clientIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Update last login info
    try {
      user.lastLoginAt = new Date();
      user.lastLoginIp = clientIp;
      await user.save();
    } catch (saveErr) {
      console.warn('[Login] Could not update last login info:', saveErr.message);
    }

    // Record login event directly in AWS S3
    recordAuthAuditLogToS3({
      event: 'LOGIN',
      userId: user._id,
      email: user.email,
      ip: clientIp,
      userAgent,
    }).catch((err) => console.warn('[AWS S3 Audit] Error:', err.message));

    // Dual-write user state and audit log to Amazon DynamoDB
    dynamoService
      .putUser(user)
      .then(() =>
        dynamoService.recordUserLogin(user._id.toString(), {
          ip: clientIp,
          userAgent,
        })
      )
      .catch((dynErr) => console.warn('[DynamoDB Login] Warning:', dynErr.message));

    const token = generateToken(user._id);

    const userData = user.toJSON();
    if (user.s3AvatarKey) {
      try {
        userData.avatarUrl = await generateAvatarViewUrl(user.s3AvatarKey);
      } catch (avatarErr) {
        console.warn('[Avatar URL] Failed to generate avatar view URL:', avatarErr.message);
      }
    }

    return res.json({
      success: true,
      data: {
        user: userData,
        token,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userData = user.toJSON();
    if (user.s3AvatarKey) {
      try {
        userData.avatarUrl = await generateAvatarViewUrl(user.s3AvatarKey);
      } catch (avatarErr) {
        console.warn('[Avatar URL] Failed to generate avatar view URL:', avatarErr.message);
      }
    }

    return res.json({ success: true, data: userData });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Generate pre-signed S3 URL for profile picture upload
 */
exports.getAvatarPresignedUrl = async (req, res) => {
  try {
    const { contentType = 'image/jpeg' } = req.body;
    const data = await generateAvatarUploadUrl(req.user.id, contentType);
    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error('Error generating avatar upload URL:', err);
    return res.status(500).json({ success: false, message: 'Could not generate avatar upload URL' });
  }
};

/**
 * Update user avatar reference in database once uploaded to S3
 */
exports.updateAvatar = async (req, res) => {
  try {
    const { s3AvatarKey } = req.body;
    if (!s3AvatarKey) {
      return res.status(400).json({ success: false, message: 's3AvatarKey is required' });
    }

    const avatarUrl = await generateAvatarViewUrl(s3AvatarKey);
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { s3AvatarKey, avatarUrl },
      { new: true }
    );

    return res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error('Error updating user avatar:', err);
    return res.status(500).json({ success: false, message: 'Could not update avatar' });
  }
};

/**
 * Reset password for user
 */
exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this email address' });
    }

    user.password = newPassword;
    await user.save();

    // Dual-write updated user & log password reset event to DynamoDB
    dynamoService
      .putUser(user)
      .then(() =>
        dynamoService.logActivity({
          userId: user._id.toString(),
          action: 'PASSWORD_RESET',
          details: { email: user.email },
        })
      )
      .catch((dynErr) => console.warn('[DynamoDB ResetPassword] Warning:', dynErr.message));

    const token = generateToken(user._id);
    const userData = user.toJSON();

    return res.json({
      success: true,
      message: 'Password updated successfully. Logging you in...',
      data: {
        user: userData,
        token,
      },
    });
  } catch (err) {
    console.error('Error resetting password:', err);
    return res.status(500).json({ success: false, message: 'Could not reset password' });
  }
};

/**
 * Retrieve user activity history & audit logs directly from DynamoDB
 */
exports.getActivityLog = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id?.toString();
    const activities = await dynamoService.getUserActivities(userId, 50);
    return res.json({
      success: true,
      database: 'Amazon DynamoDB (finsight-core-prod)',
      data: activities,
    });
  } catch (err) {
    console.error('Error fetching activity log:', err);
    return res.status(500).json({ success: false, message: 'Could not fetch activity log' });
  }
};

/**
 * Retrieve database information and summary
 */
exports.getDatabaseInfo = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id?.toString();
    const [activities, subscriptions] = await Promise.all([
      dynamoService.getUserActivities(userId, 20),
      dynamoService.getRecurringTemplatesByUserId(userId),
    ]);

    return res.json({
      success: true,
      database: {
        engine: 'Amazon DynamoDB',
        table: 'finsight-core-prod',
        secondaryTable: 'finsight-ephemeral-prod',
        billingMode: 'Pay-per-request (On-Demand)',
        costEstimate: '$0.00 / month (AWS Free Tier)',
        encryption: 'AWS Key Management / SSE-S3',
      },
      userSummary: {
        userId,
        accountCreatedAt: req.user.createdAt,
        activeSubscriptions: subscriptions.length,
        subscriptions: subscriptions.map((s) => ({
          name: s.name,
          amount: s.amount,
          frequency: s.frequency,
          nextDueDate: s.nextDueDate,
          status: s.status,
        })),
        recentActivityCount: activities.length,
      },
    });
  } catch (err) {
    console.error('Error fetching database info:', err);
    return res.status(500).json({ success: false, message: 'Could not fetch database info' });
  }
};

