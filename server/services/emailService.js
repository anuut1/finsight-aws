const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

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

/**
 * Send an email using Amazon SES
 */
async function sendTransactionalEmailViaSes({ toEmail, subject, htmlBody, textBody }) {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL;
  if (!fromEmail || !toEmail) {
    return { success: false, message: 'Missing SES sender or recipient email' };
  }

  try {
    const sesClient = getSesClient();
    const command = new SendEmailCommand({
      Source: fromEmail,
      Destination: {
        ToAddresses: [toEmail],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8',
          },
          Text: {
            Data: textBody,
            Charset: 'UTF-8',
          },
        },
      },
    });

    const response = await sesClient.send(command);
    return { success: true, messageId: response.MessageId };
  } catch (err) {
    console.warn(`[AWS SES] Failed sending email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a welcome email to newly registered FinSight users
 */
async function sendWelcomeEmailViaSes({ toEmail, userName }) {
  const appUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const subject = `Welcome to FinSight, ${userName}! 🚀`;
  const textBody = `Hi ${userName},\n\nWelcome to FinSight! Your account has been created successfully.\n\nStart tracking expenses, scanning receipts with AWS Textract, and managing your financial goals:\n${appUrl}\n\nBest regards,\nThe FinSight Team`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to FinSight</title>
</head>
<body style="background-color: #0B1120; color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; margin: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #1E293B; border-radius: 12px; overflow: hidden; border: 1px solid #334155;">
    <tr>
      <td style="padding: 32px 32px 20px 32px; background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700;">FinSight</h1>
        <p style="margin: 8px 0 0 0; color: #E0E7FF; font-size: 14px;">Autonomous Financial Intelligence</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <h2 style="margin: 0 0 16px 0; color: #F8FAFC; font-size: 20px;">Welcome aboard, ${userName}! 👋</h2>
        <p style="color: #94A3B8; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
          Your account is ready. FinSight connects directly to AWS S3 and machine learning models to help you:
        </p>
        <ul style="color: #CBD5E1; font-size: 14px; line-height: 1.8; margin: 0 0 24px 0; padding-left: 20px;">
          <li>Scan and digitize physical receipts automatically into Amazon S3</li>
          <li>Log and categorize daily expenses in real time</li>
          <li>Receive daily end-of-day digest reminders</li>
          <li>Split bills and track group expenses effortlessly</li>
        </ul>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${appUrl}" style="background-color: #6366F1; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Open FinSight Dashboard
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px 32px; background-color: #0F172A; text-align: center; font-size: 12px; color: #64748B;">
        Sent securely via Amazon Simple Email Service (SES).
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendTransactionalEmailViaSes({
    toEmail,
    subject,
    htmlBody,
    textBody,
  });
}

/**
 * Send an invitation email to a friend who is not yet on FinSight
 */
async function sendFriendInviteEmailViaSes({ toEmail, inviterName, inviterCode }) {
  const appUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const registerUrl = inviterCode
    ? `${appUrl}/register?friendCode=${encodeURIComponent(inviterCode)}&email=${encodeURIComponent(toEmail)}`
    : `${appUrl}/register`;
  const subject = `${inviterName || 'A friend'} invited you to connect on FinSight 🤝`;
  const textBody = `Hi,\n\n${inviterName || 'A friend'} invited you to connect on FinSight to split expenses, track trips, and manage shared finances together.\n\nJoin here:\n${registerUrl}\n\nBest regards,\nThe FinSight Team`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Connect on FinSight</title>
</head>
<body style="background-color: #0B1120; color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; margin: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #1E293B; border-radius: 12px; overflow: hidden; border: 1px solid #334155;">
    <tr>
      <td style="padding: 32px 32px 20px 32px; background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700;">FinSight</h1>
        <p style="margin: 8px 0 0 0; color: #E0E7FF; font-size: 14px;">Smart Financial & Expense Collaboration</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <h2 style="margin: 0 0 16px 0; color: #F8FAFC; font-size: 20px;">${inviterName || 'A friend'} wants to connect with you! 🤝</h2>
        <p style="color: #94A3B8; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
          ${inviterName || 'Your friend'} uses FinSight to track trip spending, split bills, and settle debts easily. Connect with them to collaborate on shared expenses.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${registerUrl}" style="background-color: #6366F1; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Join FinSight & Connect
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px 32px; background-color: #0F172A; text-align: center; font-size: 12px; color: #64748B;">
        Sent securely via Amazon Simple Email Service (SES).
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendTransactionalEmailViaSes({
    toEmail,
    subject,
    htmlBody,
    textBody,
  });
}

/**
 * Send an email inviting a user to a split group or trip.
 */
async function sendGroupInviteEmailViaSes({ toEmail, inviterName, groupName, isTrip = false, inviteToken, isRegistered = false }) {
  const appUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const entityType = isTrip ? 'trip' : 'split group';
  const inviteUrl = isRegistered
    ? `${appUrl}/splits?invite=${encodeURIComponent(inviteToken)}`
    : `${appUrl}/register?invite=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(toEmail)}`;

  const subject = `${inviterName || 'A friend'} invited you to join "${groupName}" on FinSight ✈️`;
  const textBody = `Hi,\n\n${inviterName || 'A friend'} has invited you to join the ${entityType} "${groupName}" on FinSight to track shared expenses and split bills.\n\nClick here to accept the invitation:\n${inviteUrl}\n\nThis invitation is single-use and will expire in 7 days.\n\nBest regards,\nThe FinSight Team`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Group Invitation</title>
</head>
<body style="background-color: #0B1120; color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; margin: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #1E293B; border-radius: 12px; overflow: hidden; border: 1px solid #334155;">
    <tr>
      <td style="padding: 32px 32px 20px 32px; background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700;">FinSight</h1>
        <p style="margin: 8px 0 0 0; color: #E0E7FF; font-size: 14px;">Collaborative Bill Splitting & Trip Expenses</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <h2 style="margin: 0 0 16px 0; color: #F8FAFC; font-size: 20px;">You're invited to "${groupName}"! ✈️</h2>
        <p style="color: #94A3B8; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
          <strong>${inviterName || 'A collaborator'}</strong> added you to the ${entityType} <strong>"${groupName}"</strong> on FinSight. Join to collaborate on expenses, check live balances, and settle up with one tap.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${inviteUrl}" style="background-color: #6366F1; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            ${isRegistered ? 'Accept Invitation & View Group' : 'Sign Up to Join Group'}
          </a>
        </div>
        <p style="color: #64748B; font-size: 13px; line-height: 1.5; margin: 20px 0 0 0;">
          Note: This invitation link expires in 7 days and is single-use.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px 32px; background-color: #0F172A; text-align: center; font-size: 12px; color: #64748B;">
        Sent securely via Amazon Simple Email Service (SES).
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendTransactionalEmailViaSes({
    toEmail,
    subject,
    htmlBody,
    textBody,
  });
}

/**
 * Send an email notifying a group member that an itemized bill has been published for claims.
 */
async function sendBillPublishedEmailViaSes({ toEmail, hostName, groupName, billTitle, billTotal }) {
  const appUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const splitsUrl = `${appUrl}/splits`;

  const subject = `🧾 Claim your items for "${billTitle}" in ${groupName}`;
  const textBody = `Hi,\n\n${hostName || 'The host'} published an itemized bill "${billTitle}" (Total: ₹${billTotal}) for "${groupName}".\n\nPlease open FinSight to claim the items you had:\n${splitsUrl}\n\nBest regards,\nThe FinSight Team`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Itemized Bill Published</title>
</head>
<body style="background-color: #0B1120; color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; margin: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #1E293B; border-radius: 12px; overflow: hidden; border: 1px solid #334155;">
    <tr>
      <td style="padding: 32px 32px 20px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700;">FinSight</h1>
        <p style="margin: 8px 0 0 0; color: #D1FAE5; font-size: 14px;">Itemized Bill Split</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <h2 style="margin: 0 0 16px 0; color: #F8FAFC; font-size: 20px;">Claim your items: ${billTitle} 🧾</h2>
        <p style="color: #94A3B8; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
          <strong>${hostName || 'A group member'}</strong> published an itemized bill of <strong>₹${billTotal}</strong> for <strong>"${groupName}"</strong>.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${splitsUrl}" style="background-color: #10B981; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Open FinSight & Claim Items
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px 32px; background-color: #0F172A; text-align: center; font-size: 12px; color: #64748B;">
        Sent securely via Amazon Simple Email Service (SES).
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendTransactionalEmailViaSes({
    toEmail,
    subject,
    htmlBody,
    textBody,
  });
}

module.exports = {
  sendTransactionalEmailViaSes,
  sendWelcomeEmailViaSes,
  sendFriendInviteEmailViaSes,
  sendGroupInviteEmailViaSes,
  sendBillPublishedEmailViaSes,
};
