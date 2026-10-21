# FinSight End-of-Day Reminder (AWS EventBridge + Lambda + SES/SNS)

This directory contains the serverless architecture for FinSight's End-of-Day unconfirmed drafts reminder, fulfilling Phase 1, Step 6.

---

## Architecture Overview

```
[ Amazon EventBridge Scheduler ]  (Daily at 21:00 / 9:00 PM)
               │
               ▼
[ AWS Lambda: eodReminderLambda ]
               │
               ▼  POST /api/transactions/drafts/eod-trigger
[ FinSight Backend API (Express) ]
         ┌─────┴────────────────┐
         ▼                      ▼
  [ Amazon SES ]         [ Amazon SNS ]
  (HTML Email Digest)     (SMS Alert)
```

1. **Amazon EventBridge Scheduler** fires daily on schedule (default: `cron(0 21 * * ? *)`).
2. **AWS Lambda** executes securely and calls FinSight's internal endpoint with a shared `REMINDER_SECRET_KEY`.
3. **FinSight Backend** gathers unconfirmed `status: 'draft'` expenses for all active users.
4. If drafts exist, it generates a JWT-signed **One-Tap Magic Approval Link** valid for 48 hours.
5. The digest is delivered via **Amazon SES** (rich HTML + plaintext) and/or **Amazon SNS** (SMS).
6. Tapping the link immediately approves all pending drafts without requiring re-login.

---

## AWS Free-Tier & Cost Profile

- **Amazon EventBridge Scheduler:** 14 million invocations/month free. (1 run/day = ~30 runs/month = **$0.00**).
- **AWS Lambda:** 1M free requests + 3.2M seconds compute/month on Free Tier. (30 runs/month at <1s = **$0.00**).
- **Amazon SES:** First 62,000 emails/month free when sent from EC2/Lambda or $0.10 per 1,000 emails.
- **Amazon SNS:** 100 SMS messages free tier (in regions where applicable) or standard carrier SMS rate.

Total ongoing cost: **$0.00 / month** on Free Tier.

---

## Environment Variables Needed

Add these to your `server/.env` (and AWS Lambda configuration):

```env
# AWS Credentials & Region
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# SES / SNS Settings
AWS_SES_FROM_EMAIL=notifications@yourdomain.com
# Optional SNS Topic ARN for SMS notifications
# AWS_SNS_TOPIC_ARN=arn:aws:sns:ap-south-1:123456789012:FinSightAlerts

# Shared Secret for authenticating scheduled cron invocations
REMINDER_SECRET_KEY=generate_a_secure_random_hex_string

# App URLs for Magic Links
CLIENT_URL=http://localhost:5173
API_BASE_URL=http://localhost:5000
```

---

## Deploying with AWS SAM or AWS CLI

### Option 1: Using AWS SAM CLI
```bash
cd server/aws
sam build
sam deploy --guided
```

### Option 2: Deploying Manually via AWS Console
1. Create a Lambda function with Node.js 20.x, upload `eodReminderLambda/index.js`.
2. Add environment variables: `FINSIGHT_API_URL` and `REMINDER_SECRET_KEY`.
3. In Amazon EventBridge > Schedules, create a schedule with target Lambda and cron `cron(0 21 * * ? *)`.
