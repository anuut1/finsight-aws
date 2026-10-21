const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const jwt = require('jsonwebtoken');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

const getAwsConfig = () => {
  const region = process.env.AWS_REGION || 'ap-south-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (accessKeyId && secretAccessKey) {
    return {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };
  }
  return { region };
};

let cachedSesClient = null;
const getSesClient = () => {
  if (!cachedSesClient) {
    cachedSesClient = new SESClient(getAwsConfig());
  }
  return cachedSesClient;
};

let cachedSnsClient = null;
const getSnsClient = () => {
  if (!cachedSnsClient) {
    cachedSnsClient = new SNSClient(getAwsConfig());
  }
  return cachedSnsClient;
};

/**
 * Generate a signed one-tap magic link token for approving drafts without re-authenticating
 */
const generateApprovalToken = (userId, draftIds) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is missing.');
  }
  return jwt.sign(
    {
      userId: userId.toString(),
      draftIds: draftIds.map((id) => id.toString()),
      action: 'approve_drafts',
    },
    secret,
    { expiresIn: '48h' }
  );
};

/**
 * Generate responsive HTML email for EOD digest
 */
const renderDigestEmailHtml = ({ userName, drafts, totalAmount, magicApproveUrl, appUrl }) => {
  const formattedTotal = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(totalAmount);

  const draftRows = drafts
    .map(
      (d) => `
      <tr style="border-bottom: 1px solid #1E293B;">
        <td style="padding: 12px 8px; color: #F8FAFC; font-weight: 600;">
          ₹${Number(d.amount).toLocaleString('en-IN')}
        </td>
        <td style="padding: 12px 8px; color: #94A3B8; font-size: 14px;">
          <span style="display:inline-block; padding: 2px 8px; border-radius: 9999px; background: #1E293B; color: #A5B4FC; font-size: 12px;">
            ${d.category || 'General'}
          </span>
        </td>
        <td style="padding: 12px 8px; color: #CBD5E1; font-size: 14px;">
          ${d.description || 'Uncategorized expense'}
        </td>
        <td style="padding: 12px 8px; color: #64748B; font-size: 12px; text-align: right;">
          ${new Date(d.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
        </td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>FinSight Daily Digest</title>
</head>
<body style="margin:0; padding:24px 0; background-color: #0B1020; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F8FAFC;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background: #0F172A; border-radius: 16px; border: 1px solid #1E293B; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
    <!-- Header -->
    <tr>
      <td style="padding: 32px 32px 20px 32px; text-align: center; border-bottom: 1px solid #1E293B;">
        <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; border-radius: 12px; background: linear-gradient(135deg, #6366F1, #8B5CF6); font-size: 22px; font-weight: bold; color: #FFFFFF; margin-bottom: 12px;">
          FS
        </div>
        <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #F8FAFC;">FinSight End-of-Day Digest</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px; color: #94A3B8;">
          Hi ${userName || 'there'}, you have <strong>${drafts.length}</strong> unconfirmed ${drafts.length === 1 ? 'draft' : 'drafts'} waiting for review.
        </p>
      </td>
    </tr>

    <!-- Summary Pill -->
    <tr>
      <td style="padding: 24px 32px 12px 32px; text-align: center;">
        <div style="background: #1E293B; border-radius: 12px; padding: 18px 24px; border: 1px solid #334155;">
          <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8;">Total Pending Approval</div>
          <div style="font-size: 32px; font-weight: 800; color: #F43F5E; margin-top: 4px;">${formattedTotal}</div>
        </div>
      </td>
    </tr>

    <!-- Drafts Table -->
    <tr>
      <td style="padding: 12px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 8px;">
          <thead>
            <tr style="border-bottom: 2px solid #334155; text-align: left;">
              <th style="padding: 8px 8px; font-size: 12px; color: #94A3B8; text-transform: uppercase;">Amount</th>
              <th style="padding: 8px 8px; font-size: 12px; color: #94A3B8; text-transform: uppercase;">Category</th>
              <th style="padding: 8px 8px; font-size: 12px; color: #94A3B8; text-transform: uppercase;">Note</th>
              <th style="padding: 8px 8px; font-size: 12px; color: #94A3B8; text-transform: uppercase; text-align: right;">Date</th>
            </tr>
          </thead>
          <tbody>
            ${draftRows}
          </tbody>
        </table>
      </td>
    </tr>

    <!-- Action Buttons -->
    <tr>
      <td style="padding: 28px 32px 20px 32px; text-align: center;">
        <a href="${magicApproveUrl}" target="_blank" style="display: inline-block; width: 100%; max-width: 380px; padding: 14px 24px; background: linear-gradient(135deg, #10B981, #059669); color: #FFFFFF; text-decoration: none; font-weight: 700; font-size: 16px; border-radius: 10px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);">
          ⚡ One-Tap Approve All (${drafts.length})
        </a>
        <div style="margin-top: 14px;">
          <a href="${appUrl}/dashboard" target="_blank" style="color: #A5B4FC; font-size: 13px; text-decoration: underline;">
            Or review and edit each item in FinSight &rarr;
          </a>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 20px 32px 32px 32px; text-align: center; border-top: 1px solid #1E293B;">
        <p style="margin: 0; font-size: 12px; color: #64748B;">
          Scheduled daily reminder powered by AWS EventBridge & Lambda.
          <br />You are receiving this because you have unconfirmed drafts in your FinSight account.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

/**
 * Process and send End-of-Day reminders for a single user or all eligible users
 */
const sendEodReminderForUser = async (user, options = {}) => {
  const { baseUrl = process.env.CLIENT_URL || 'http://localhost:5173' } = options;

  const drafts = await Transaction.find({
    userId: user._id,
    status: 'draft',
  }).sort({ date: -1 });

  if (!drafts.length) {
    return {
      success: true,
      hasDrafts: false,
      message: 'No pending drafts found for this user',
      draftCount: 0,
    };
  }

  const totalAmount = drafts.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const token = generateApprovalToken(
    user._id,
    drafts.map((d) => d._id)
  );

  const serverApiUrl = process.env.API_BASE_URL || 'http://localhost:5000';
  const magicApproveUrl = `${serverApiUrl}/api/transactions/drafts/magic-approve?token=${encodeURIComponent(
    token
  )}`;

  const emailHtml = renderDigestEmailHtml({
    userName: user.name,
    drafts,
    totalAmount,
    magicApproveUrl,
    appUrl: baseUrl,
  });

  const plainText = `Hi ${user.name},\n\nYou have ${drafts.length} unconfirmed drafts today totaling ₹${totalAmount}.\n\nApprove all with one tap:\n${magicApproveUrl}\n\nReview in app: ${baseUrl}/dashboard\n\n— FinSight Automated Reminder`;

  let sesSent = false;
  let snsSent = false;
  let sesMessageId = null;
  let snsMessageId = null;
  let error = null;

  // Attempt AWS SES if configured
  if (process.env.AWS_SES_FROM_EMAIL && user.email) {
    try {
      const sesClient = getSesClient();
      const sendEmailCmd = new SendEmailCommand({
        Source: process.env.AWS_SES_FROM_EMAIL,
        Destination: {
          ToAddresses: [user.email],
        },
        Message: {
          Subject: {
            Data: `FinSight: You have ${drafts.length} unconfirmed expenses today (₹${totalAmount.toLocaleString('en-IN')})`,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: emailHtml,
              Charset: 'UTF-8',
            },
            Text: {
              Data: plainText,
              Charset: 'UTF-8',
            },
          },
        },
      });

      const sesResponse = await sesClient.send(sendEmailCmd);
      sesSent = true;
      sesMessageId = sesResponse.MessageId;
    } catch (err) {
      console.warn(`[AWS SES] Failed sending reminder to ${user.email}:`, err.message);
      error = err.message;
    }
  }

  // Attempt AWS SNS (SMS) if user has a configured phone number or topic
  if (process.env.AWS_SNS_TOPIC_ARN || options.phoneNumber) {
    try {
      const snsClient = getSnsClient();
      const smsText = `FinSight: ${drafts.length} unconfirmed expense drafts (₹${totalAmount}). One-tap approve: ${magicApproveUrl}`;
      const publishCmd = new PublishCommand({
        Message: smsText,
        TopicArn: process.env.AWS_SNS_TOPIC_ARN,
        PhoneNumber: options.phoneNumber,
      });
      const snsResponse = await snsClient.send(publishCmd);
      snsSent = true;
      snsMessageId = snsResponse.MessageId;
    } catch (err) {
      console.warn(`[AWS SNS] Failed sending SMS reminder:`, err.message);
    }
  }

  return {
    success: true,
    hasDrafts: true,
    draftCount: drafts.length,
    totalAmount,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
    notification: {
      sesSent,
      sesMessageId,
      snsSent,
      snsMessageId,
      simulated: !sesSent && !snsSent,
      magicApproveUrl,
      previewHtml: emailHtml,
      plainText,
      error,
    },
  };
};

/**
 * Execute digest sweep across all users with unconfirmed drafts
 * (Invoked by EventBridge -> Lambda or internal cron endpoint)
 */
const sweepAllUsersForEodReminders = async (options = {}) => {
  const usersWithDrafts = await Transaction.distinct('userId', { status: 'draft' });

  const results = [];
  for (const userId of usersWithDrafts) {
    const user = await User.findById(userId);
    if (user) {
      const userResult = await sendEodReminderForUser(user, options);
      results.push(userResult);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    totalUsersProcessed: results.length,
    results,
  };
};

module.exports = {
  generateApprovalToken,
  sendEodReminderForUser,
  sweepAllUsersForEodReminders,
  renderDigestEmailHtml,
};
