const mongoose = require('mongoose');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { putUser, putRecurringTemplate, putTransaction, logActivity } = require('../services/dynamoService');

async function getMongoUri() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI;
  }
  const secretArn = process.env.SECRETS_ARN || 'arn:aws:secretsmanager:ap-south-1:982503294595:secret:finsight/prod/app-secrets-UXVgBv';
  const sm = new SecretsManagerClient({ region: 'ap-south-1' });
  const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secrets = JSON.parse(res.SecretString);
  return secrets.MONGO_URI || secrets.MONGODB_URI;
}

async function runSync() {
  console.log('[Sync] Starting MongoDB to DynamoDB synchronization...');
  const mongoUri = await getMongoUri();
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log('[Sync] Connected to MongoDB Atlas successfully.');

  const db = mongoose.connection.db;

  // 1. Sync Users
  const usersCollection = db.collection('users');
  const users = await usersCollection.find({}).toArray();
  console.log(`[Sync] Found ${users.length} users to sync to DynamoDB.`);

  for (const user of users) {
    await putUser(user);
    // Also create account creation activity if not already present
    await logActivity({
      userId: user._id.toString(),
      action: 'ACCOUNT_CREATED',
      details: {
        name: user.name,
        email: user.email,
        originalCreatedAt: user.createdAt,
      },
    });
  }
  console.log(`[Sync] Successfully synced ${users.length} users.`);

  // 2. Sync Recurring Templates (Subscriptions)
  const recurringCollection = db.collection('recurringtemplates');
  const subscriptions = await recurringCollection.find({}).toArray();
  console.log(`[Sync] Found ${subscriptions.length} recurring subscriptions to sync.`);

  for (const sub of subscriptions) {
    await putRecurringTemplate(sub);
    await logActivity({
      userId: sub.userId.toString(),
      action: 'SUBSCRIPTION_REGISTERED',
      details: {
        subscriptionName: sub.name,
        amount: sub.amount,
        frequency: sub.frequency,
        nextDueDate: sub.nextDueDate,
      },
    });
  }
  console.log(`[Sync] Successfully synced ${subscriptions.length} recurring subscriptions.`);

  // 3. Sync Transactions
  const txCollection = db.collection('transactions');
  const transactions = await txCollection.find({}).toArray();
  console.log(`[Sync] Found ${transactions.length} transactions to sync.`);

  for (const tx of transactions) {
    await putTransaction(tx);
  }
  console.log(`[Sync] Successfully synced ${transactions.length} transactions.`);

  await mongoose.disconnect();
  console.log('[Sync] Complete! All entities synced into DynamoDB finsight-core-prod.');
}

if (require.main === module) {
  runSync()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Sync Error]', err.message);
      process.exit(1);
    });
}

module.exports = { runSync };
