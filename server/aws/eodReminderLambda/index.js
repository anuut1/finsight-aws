/**
 * AWS Lambda Handler for FinSight End-of-Day Drafts Reminder
 *
 * Triggered by: Amazon EventBridge Scheduler (e.g. daily at 21:00 / 9:00 PM)
 * Function: Triggers the FinSight reminder sweep across users with unconfirmed drafts
 * and dispatches digests via Amazon SES (Email) and/or Amazon SNS (SMS).
 */

const https = require('https');
const http = require('http');

exports.handler = async (event, context) => {
  console.log('FinSight EOD Reminder Lambda triggered at:', new Date().toISOString());
  console.log('Event details:', JSON.stringify(event, null, 2));

  const apiUrl = process.env.FINSIGHT_API_URL || 'http://localhost:5000';
  const reminderSecret = process.env.REMINDER_SECRET_KEY;

  if (!reminderSecret) {
    console.error('REMINDER_SECRET_KEY is not defined in Lambda environment variables');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing REMINDER_SECRET_KEY configuration' }),
    };
  }

  const endpointUrl = new URL('/api/transactions/drafts/eod-trigger', apiUrl);
  const isHttps = endpointUrl.protocol === 'https:';
  const client = isHttps ? https : http;

  const postData = JSON.stringify({
    source: 'aws.eventbridge.scheduler',
    timestamp: new Date().toISOString(),
  });

  const options = {
    hostname: endpointUrl.hostname,
    port: endpointUrl.port || (isHttps ? 443 : 80),
    path: endpointUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'x-reminder-secret': reminderSecret,
      'User-Agent': 'FinSight-AWS-EventBridge-Lambda/1.0',
    },
    timeout: 25000,
  };

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        console.log(`Backend API responded with status ${res.statusCode}:`, body);
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = { raw: body };
        }

        resolve({
          statusCode: res.statusCode,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'FinSight EOD reminder sweep executed successfully',
            backendStatus: res.statusCode,
            data: parsed,
          }),
        });
      });
    });

    req.on('error', (err) => {
      console.error('Failed to trigger FinSight reminder endpoint:', err.message);
      resolve({
        statusCode: 502,
        body: JSON.stringify({
          error: 'Failed to communicate with FinSight backend',
          details: err.message,
        }),
      });
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('Request timed out calling FinSight backend');
      resolve({
        statusCode: 504,
        body: JSON.stringify({ error: 'FinSight backend timed out after 25s' }),
      });
    });

    req.write(postData);
    req.end();
  });
};
