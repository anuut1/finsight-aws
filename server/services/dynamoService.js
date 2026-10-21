const {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { dynamoDocClient, CORE_TABLE, EPHEMERAL_TABLE } = require('./dynamoClient');

function cleanForDynamo(val) {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object' && (typeof val.toHexString === 'function' || val._bsontype === 'ObjectID')) {
    return val.toString();
  }
  if (Array.isArray(val)) return val.map(cleanForDynamo);
  if (typeof val === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        res[k] = cleanForDynamo(v);
      }
    }
    return res;
  }
  return val;
}

// ==========================================
// 1. User Management (Single-Table Design)
// ==========================================

/**
 * Save or update a user profile in DynamoDB.
 */
async function putUser(userData) {
  const userId = userData.userId || userData._id?.toString() || crypto.randomUUID();
  const email = (userData.email || '').toLowerCase().trim();
  const now = new Date().toISOString();

  const item = {
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    GSI1PK: `EMAIL#${email}`,
    GSI1SK: `USER#${userId}`,
    entityType: 'User',
    userId,
    name: userData.name,
    email,
    password: userData.password,
    avatarUrl: userData.avatarUrl || '',
    s3AvatarKey: userData.s3AvatarKey || '',
    friendCode: userData.friendCode || `FS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    lastLoginAt: userData.lastLoginAt ? new Date(userData.lastLoginAt).toISOString() : null,
    lastLoginIp: userData.lastLoginIp || null,
    createdAt: userData.createdAt ? new Date(userData.createdAt).toISOString() : now,
    updatedAt: now,
  };

  await dynamoDocClient.send(
    new PutCommand({
      TableName: CORE_TABLE,
      Item: cleanForDynamo(item),
    })
  );

  return item;
}

/**
 * Get user by unique ID.
 */
async function getUserById(userId) {
  const cleanId = userId?.toString();
  const result = await dynamoDocClient.send(
    new GetCommand({
      TableName: CORE_TABLE,
      Key: {
        PK: `USER#${cleanId}`,
        SK: 'PROFILE',
      },
    })
  );
  return result.Item || null;
}

/**
 * Get user by Email via GSI1.
 */
async function getUserByEmail(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const result = await dynamoDocClient.send(
    new QueryCommand({
      TableName: CORE_TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :emailPk',
      ExpressionAttributeValues: {
        ':emailPk': `EMAIL#${cleanEmail}`,
      },
      Limit: 1,
    })
  );

  if (result.Items && result.Items.length > 0) {
    const item = result.Items[0];
    return item;
  }
  return null;
}

/**
 * Update user last login metadata and audit.
 */
async function recordUserLogin(userId, { ip, userAgent } = {}) {
  const now = new Date().toISOString();
  await dynamoDocClient.send(
    new UpdateCommand({
      TableName: CORE_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE',
      },
      UpdateExpression: 'SET lastLoginAt = :now, lastLoginIp = :ip, updatedAt = :now',
      ExpressionAttributeValues: {
        ':now': now,
        ':ip': ip || 'unknown',
      },
    })
  );

  // Also log activity
  await logActivity({
    userId,
    action: 'USER_LOGIN',
    details: { ip, userAgent },
    ip,
    userAgent,
  });
}

// ==========================================
// 2. Audit Trail & User Activity Logs
// ==========================================

/**
 * Log user activity in DynamoDB (Registration, Subscription payment, Login, Expense log).
 */
async function logActivity({ userId, action, details = {}, ip = '', userAgent = '' }) {
  const activityId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const item = {
    PK: `USER#${userId}`,
    SK: `ACTIVITY#${timestamp}#${activityId}`,
    GSI1PK: 'ACTIVITIES',
    GSI1SK: `TIMESTAMP#${timestamp}`,
    entityType: 'Activity',
    activityId,
    userId,
    action,
    details,
    ip,
    userAgent,
    timestamp,
  };

  await dynamoDocClient.send(
    new PutCommand({
      TableName: CORE_TABLE,
      Item: cleanForDynamo(item),
    })
  );

  return item;
}

/**
 * Get recent activity log for a specific user.
 */
async function getUserActivities(userId, limit = 50) {
  const result = await dynamoDocClient.send(
    new QueryCommand({
      TableName: CORE_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'ACTIVITY#',
      },
      ScanIndexForward: false, // newest first
      Limit: limit,
    })
  );

  return result.Items || [];
}

/**
 * Get recent activity logs across all users (Admin view).
 */
async function getAllRecentActivities(limit = 100) {
  const result = await dynamoDocClient.send(
    new QueryCommand({
      TableName: CORE_TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: {
        ':gsi1pk': 'ACTIVITIES',
      },
      ScanIndexForward: false, // newest first
      Limit: limit,
    })
  );

  return result.Items || [];
}

// ==========================================
// 3. Recurring Subscriptions
// ==========================================

/**
 * Store a recurring subscription template.
 */
async function putRecurringTemplate(template) {
  const templateId = template.templateId || template._id?.toString() || crypto.randomUUID();
  const userId = template.userId?.toString();
  const now = new Date().toISOString();
  const nextDueDateIso = template.nextDueDate ? new Date(template.nextDueDate).toISOString() : now;
  const status = template.status || 'active';

  const item = {
    PK: `USER#${userId}`,
    SK: `SUB#${templateId}`,
    GSI1PK: `STATUS#${status}`,
    GSI1SK: `DUEDATE#${nextDueDateIso}`,
    entityType: 'RecurringTemplate',
    templateId,
    userId,
    name: template.name,
    amount: Number(template.amount) || 0,
    category: template.category || 'Bills & Utilities',
    frequency: template.frequency || 'monthly',
    billingDay: template.billingDay || 1,
    nextDueDate: nextDueDateIso,
    paymentMethod: template.paymentMethod || 'UPI',
    status,
    autoLog: !!template.autoLog,
    lastLoggedAt: template.lastLoggedAt ? new Date(template.lastLoggedAt).toISOString() : null,
    createdAt: template.createdAt ? new Date(template.createdAt).toISOString() : now,
    updatedAt: now,
  };

  await dynamoDocClient.send(
    new PutCommand({
      TableName: CORE_TABLE,
      Item: cleanForDynamo(item),
    })
  );

  return item;
}

/**
 * Get all recurring subscriptions for a user.
 */
async function getRecurringTemplatesByUserId(userId) {
  const result = await dynamoDocClient.send(
    new QueryCommand({
      TableName: CORE_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'SUB#',
      },
    })
  );

  return result.Items || [];
}

/**
 * Query upcoming due subscriptions across all users for reminder dispatch.
 */
async function getDueSubscriptions(upToDate = new Date()) {
  const upToIso = upToDate.toISOString();
  const result = await dynamoDocClient.send(
    new QueryCommand({
      TableName: CORE_TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :status AND GSI1SK <= :upTo',
      ExpressionAttributeValues: {
        ':status': 'STATUS#active',
        ':upTo': `DUEDATE#${upToIso}`,
      },
    })
  );

  return result.Items || [];
}

// ==========================================
// 4. Transactions (Single-Table Design)
// ==========================================

/**
 * Store a financial transaction.
 */
async function putTransaction(tx) {
  const txId = tx.txId || tx._id?.toString() || crypto.randomUUID();
  const userId = tx.userId?.toString();
  const dateIso = tx.date ? new Date(tx.date).toISOString() : new Date().toISOString();
  const now = new Date().toISOString();

  const item = {
    PK: `USER#${userId}`,
    SK: `TX#${dateIso}#${txId}`,
    GSI1PK: `USER#${userId}#CAT#${tx.category || 'General'}`,
    GSI1SK: `DATE#${dateIso}`,
    entityType: 'Transaction',
    txId,
    userId,
    type: tx.type || 'expense',
    category: tx.category || 'General',
    amount: Number(tx.amount) || 0,
    description: tx.description || '',
    date: dateIso,
    tags: tx.tags || [],
    currency: tx.currency || 'INR',
    receiptS3Key: tx.receiptS3Key || '',
    receiptUrl: tx.receiptUrl || '',
    subscriptionDetected: tx.subscriptionDetected || false,
    createdAt: tx.createdAt ? new Date(tx.createdAt).toISOString() : now,
    updatedAt: now,
  };

  await dynamoDocClient.send(
    new PutCommand({
      TableName: CORE_TABLE,
      Item: cleanForDynamo(item),
    })
  );

  return item;
}

/**
 * Get transactions for a user (newest first).
 */
async function getTransactionsByUserId(userId, limit = 50) {
  const result = await dynamoDocClient.send(
    new QueryCommand({
      TableName: CORE_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'TX#',
      },
      ScanIndexForward: false, // Newest transactions first
      Limit: limit,
    })
  );

  return result.Items || [];
}

// ==========================================
// 5. Ephemeral Receipt Jobs & TTL Cache
// ==========================================

async function putEphemeralJob(jobId, data, ttlSeconds = 86400) {
  const nowSec = Math.floor(Date.now() / 1000);
  const item = {
    PK: `RECEIPT_JOB#${jobId}`,
    SK: 'METADATA',
    ttl: nowSec + ttlSeconds,
    ...data,
  };

  await dynamoDocClient.send(
    new PutCommand({
      TableName: EPHEMERAL_TABLE,
      Item: cleanForDynamo(item),
    })
  );

  return item;
}

async function getEphemeralJob(jobId) {
  const result = await dynamoDocClient.send(
    new GetCommand({
      TableName: EPHEMERAL_TABLE,
      Key: {
        PK: `RECEIPT_JOB#${jobId}`,
        SK: 'METADATA',
      },
    })
  );

  return result.Item || null;
}

module.exports = {
  putUser,
  getUserById,
  getUserByEmail,
  recordUserLogin,
  logActivity,
  getUserActivities,
  getAllRecentActivities,
  putRecurringTemplate,
  getRecurringTemplatesByUserId,
  getDueSubscriptions,
  putTransaction,
  getTransactionsByUserId,
  putEphemeralJob,
  getEphemeralJob,
};
