const RecurringTemplate = require('../models/RecurringTemplate');
const User = require('../models/User');
const { sendTransactionalEmailViaSes } = require('./emailService');
const { logger } = require('../utils/logger');

/**
 * Catalog of known recurring subscription patterns with smart defaults
 */
const SUBSCRIPTION_CATALOG = [
  {
    pattern: /netflix/i,
    name: 'Netflix',
    category: 'Entertainment',
    frequency: 'monthly',
    logo: '🍿',
  },
  {
    pattern: /spotify/i,
    name: 'Spotify',
    category: 'Entertainment',
    frequency: 'monthly',
    logo: '🎵',
  },
  {
    pattern: /amazon\s*prime|prime\s*video/i,
    name: 'Amazon Prime',
    category: 'Entertainment',
    frequency: (amount) => (amount > 999 ? 'yearly' : 'monthly'),
    logo: '📦',
  },
  {
    pattern: /hotstar|disney\+?/i,
    name: 'Disney+ Hotstar',
    category: 'Entertainment',
    frequency: (amount) => (amount > 499 ? 'yearly' : 'monthly'),
    logo: '✨',
  },
  {
    pattern: /youtube\s*prem|yt\s*prem/i,
    name: 'YouTube Premium',
    category: 'Entertainment',
    frequency: 'monthly',
    logo: '▶️',
  },
  {
    pattern: /apple\s*(music|tv|one|icloud)/i,
    name: 'Apple Subscription',
    category: 'Entertainment',
    frequency: 'monthly',
    logo: '🍎',
  },
  {
    pattern: /chatgpt|openai|claude|anthropic/i,
    name: 'AI Subscription',
    category: 'Education',
    frequency: 'monthly',
    logo: '🤖',
  },
  {
    pattern: /gym|cult\.fit|anytime\s*fitness|gold'?s\s*gym/i,
    name: 'Gym Membership',
    category: 'Personal Care',
    frequency: 'monthly',
    logo: '💪',
  },
  {
    pattern: /airtel\s*broadband|jio\s*fiber|act\s*fiber|broadband|wifi/i,
    name: 'Broadband Internet',
    category: 'Bills & Utilities',
    frequency: 'monthly',
    logo: '🌐',
  },
  {
    pattern: /electricity|bescom|tneb|mseb|power\s*bill/i,
    name: 'Electricity Bill',
    category: 'Bills & Utilities',
    frequency: 'monthly',
    logo: '⚡',
  },
];

/**
 * Detects if a transaction description or merchant name corresponds to a recurring subscription
 */
function detectSubscription(text = '', amount = 0) {
  if (!text || typeof text !== 'string') return null;

  for (const item of SUBSCRIPTION_CATALOG) {
    if (item.pattern.test(text)) {
      const frequency = typeof item.frequency === 'function' ? item.frequency(amount) : item.frequency;
      return {
        name: item.name,
        category: item.category,
        frequency,
        logo: item.logo,
        matched: true,
      };
    }
  }

  // Generic fallback if marked as subscription/recurring
  if (/subscription|recurring|autopay|auto-debit|membership/i.test(text)) {
    return {
      name: text.trim().slice(0, 30),
      category: 'Bills & Utilities',
      frequency: 'monthly',
      logo: '🔁',
      matched: true,
    };
  }

  return null;
}

/**
 * Calculates the next due date based on payment date and frequency
 */
function calculateNextDueDate(paymentDate, frequency = 'monthly', billingDay = null) {
  const date = new Date(paymentDate || Date.now());
  if (isNaN(date.getTime())) {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  const targetDay = billingDay || date.getDate();
  const next = new Date(date);

  if (frequency === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else if (frequency === 'quarterly') {
    next.setMonth(next.getMonth() + 3);
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (frequency === 'daily') {
    next.setDate(next.getDate() + 1);
  } else {
    // monthly default
    next.setMonth(next.getMonth() + 1);
    const maxDays = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(targetDay, maxDays));
  }

  return next;
}

/**
 * Automatically syncs a transaction with RecurringTemplate:
 * Detects subscription, calculates next due date, updates or creates template,
 * and schedules/sends an AWS SES confirmation & reminder.
 */
async function syncTransactionSubscription({
  userId,
  description = '',
  amount = 0,
  date = new Date(),
  paymentMethod = 'UPI',
  category = '',
}) {
  try {
    const detected = detectSubscription(description, amount);
    if (!detected) {
      return null;
    }

    const paymentDate = new Date(date);
    const billingDay = paymentDate.getDate();
    const nextDueDate = calculateNextDueDate(paymentDate, detected.frequency, billingDay);

    // Look for existing active template for this user
    let template = await RecurringTemplate.findOne({
      userId,
      $or: [
        { name: new RegExp(`^${detected.name}$`, 'i') },
        { name: new RegExp(detected.name, 'i') },
      ],
    });

    let isNew = false;
    if (template) {
      template.amount = Number(amount) || template.amount;
      template.lastLoggedAt = paymentDate;
      template.nextDueDate = nextDueDate;
      template.billingDay = billingDay;
      template.status = 'active';
      await template.save();
    } else {
      isNew = true;
      template = await RecurringTemplate.create({
        userId,
        name: detected.name,
        amount: Number(amount),
        type: 'expense',
        category: detected.category || category || 'Entertainment',
        frequency: detected.frequency,
        billingDay,
        nextDueDate,
        paymentMethod: paymentMethod || 'Auto-Debit',
        lastLoggedAt: paymentDate,
        status: 'active',
        tags: ['auto-detected', detected.name.toLowerCase()],
        note: `Auto-detected from payment on ${paymentDate.toLocaleDateString('en-IN')}`,
      });
    }

    // Attempt to notify user via SES of the newly detected/scheduled renewal
    try {
      const user = await User.findById(userId);
      if (user && user.email && process.env.AWS_SES_FROM_EMAIL) {
        const formattedNextDate = nextDueDate.toLocaleDateString('en-IN', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        await sendTransactionalEmailViaSes({
          toEmail: user.email,
          subject: `🔔 ${detected.logo} FinSight: Next ${detected.name} renewal set for ${formattedNextDate}`,
          htmlBody: `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:24px 0; background-color:#0B1020; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#F8FAFC;">
  <table width="100%" cellspacing="0" cellpadding="0" style="max-width:540px; margin:0 auto; background:#0F172A; border-radius:16px; border:1px solid #1E293B; overflow:hidden;">
    <tr>
      <td style="padding:28px 32px; background:linear-gradient(135deg, #1E1B4B 0%, #0F172A 100%); border-bottom:1px solid #1E293B;">
        <span style="font-size:32px;">${detected.logo}</span>
        <h2 style="margin:8px 0 4px 0; color:#FFFFFF; font-size:20px;">Subscription Detected: ${detected.name}</h2>
        <p style="margin:0; color:#94A3B8; font-size:14px;">Next due date automatically recognized & scheduled</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <p style="color:#CBD5E1; font-size:15px; line-height:1.6; margin-top:0;">
          Hi ${user.name || 'there'}, we noticed your <strong>${detected.name}</strong> payment of <strong>₹${amount.toLocaleString('en-IN')}</strong>.
        </p>
        <div style="background:#1E293B; border-radius:12px; padding:16px 20px; margin:20px 0; border:1px solid #334155;">
          <table width="100%">
            <tr>
              <td style="color:#94A3B8; font-size:13px;">Next Due Date</td>
              <td style="text-align:right; color:#38BDF8; font-weight:700; font-size:15px;">${formattedNextDate}</td>
            </tr>
            <tr>
              <td style="color:#94A3B8; font-size:13px; padding-top:8px;">Renewal Amount</td>
              <td style="text-align:right; color:#F8FAFC; font-weight:600; font-size:15px; padding-top:8px;">₹${amount.toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td style="color:#94A3B8; font-size:13px; padding-top:8px;">Frequency</td>
              <td style="text-align:right; color:#CBD5E1; font-size:14px; text-transform:capitalize; padding-top:8px;">${detected.frequency}</td>
            </tr>
          </table>
        </div>
        <p style="color:#94A3B8; font-size:13px; margin-bottom:0;">
          FinSight will automatically remind you before your next renewal date so you are always in control of your subscriptions.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
          `,
          textBody: `FinSight Subscription Reminder: Your next ${detected.name} payment of ₹${amount} is scheduled for ${formattedNextDate}.`,
        });
      }
    } catch (notifyErr) {
      logger.warn({ err: notifyErr.message }, 'Failed to send subscription confirmation email via SES');
    }

    return {
      detected: true,
      name: detected.name,
      category: detected.category,
      frequency: detected.frequency,
      logo: detected.logo,
      nextDueDate,
      billingDay,
      amount: template.amount,
      isNew,
      templateId: template._id,
    };
  } catch (err) {
    logger.error({ err: err.message }, 'Error in syncTransactionSubscription');
    return null;
  }
}

/**
 * Sweep for upcoming subscription due dates and send reminder emails
 */
async function sendUpcomingSubscriptionReminders(daysAhead = 3) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + daysAhead);
  horizon.setHours(23, 59, 59, 999);

  const dueSoonTemplates = await RecurringTemplate.find({
    status: 'active',
    type: 'expense',
    nextDueDate: { $gte: now, $lte: horizon },
  }).populate('userId');

  const results = [];
  for (const t of dueSoonTemplates) {
    const user = t.userId;
    if (!user || !user.email) continue;

    const diffMs = new Date(t.nextDueDate).getTime() - now.getTime();
    const daysUntilDue = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const dueLabel = daysUntilDue === 0 ? 'today' : daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`;

    const formattedDate = new Date(t.nextDueDate).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
    });

    const emailRes = await sendTransactionalEmailViaSes({
      toEmail: user.email,
      subject: `🔔 Reminder: ${t.name} payment of ₹${t.amount} is due ${dueLabel} (${formattedDate})`,
      htmlBody: `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:24px 0; background-color:#0B1020; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#F8FAFC;">
  <table width="100%" cellspacing="0" cellpadding="0" style="max-width:540px; margin:0 auto; background:#0F172A; border-radius:16px; border:1px solid #1E293B; overflow:hidden;">
    <tr>
      <td style="padding:28px 32px; background:linear-gradient(135deg, #1E1B4B 0%, #0F172A 100%); border-bottom:1px solid #1E293B;">
        <h2 style="margin:0 0 4px 0; color:#F59E0B; font-size:20px;">Upcoming Bill Reminder</h2>
        <p style="margin:0; color:#94A3B8; font-size:14px;">Your ${t.name} renewal is due ${dueLabel}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <p style="color:#CBD5E1; font-size:15px; margin-top:0;">
          Hi ${user.name || 'there'}, your recurring payment for <strong>${t.name}</strong> of <strong>₹${t.amount.toLocaleString('en-IN')}</strong> is scheduled for <strong>${formattedDate}</strong>.
        </p>
        <p style="color:#94A3B8; font-size:13px; margin-bottom:0;">
          Make sure your linked account has sufficient balance, or review in FinSight.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      textBody: `Reminder: Your ${t.name} payment of ₹${t.amount} is due ${dueLabel} (${formattedDate}).`,
    });

    results.push({
      templateId: t._id,
      name: t.name,
      userEmail: user.email,
      daysUntilDue,
      sent: emailRes.success,
    });
  }

  return { totalChecked: dueSoonTemplates.length, remindersSent: results.length, details: results };
}

module.exports = {
  detectSubscription,
  calculateNextDueDate,
  syncTransactionSubscription,
  sendUpcomingSubscriptionReminders,
};
