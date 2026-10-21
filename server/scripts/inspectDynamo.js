const { dynamoDocClient, CORE_TABLE } = require('../services/dynamoClient');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

async function inspect() {
  const res = await dynamoDocClient.send(
    new ScanCommand({
      TableName: CORE_TABLE,
    })
  );

  const byType = {};
  for (const item of res.Items) {
    const type = item.entityType || 'Unknown';
    if (!byType[type]) byType[type] = [];
    byType[type].push(item);
  }

  console.log('=== DynamoDB Table: ' + CORE_TABLE + ' ===');
  console.log('Total Items:', res.Items.length);

  console.log('\n--- Users Registered in Database (' + (byType['User'] || []).length + ') ---');
  for (const u of byType['User'] || []) {
    console.log(`- ${u.name} | ${u.email} | Created: ${u.createdAt} | Last Login: ${u.lastLoginAt || 'None'}`);
  }

  console.log('\n--- Recurring Subscriptions (' + (byType['RecurringTemplate'] || []).length + ') ---');
  for (const s of byType['RecurringTemplate'] || []) {
    console.log(`- App: ${s.name} | Amount: ₹${s.amount} | Due: ${s.nextDueDate} | Status: ${s.status}`);
  }

  console.log('\n--- Activity Audit Trail (' + (byType['Activity'] || []).length + ') ---');
  for (const a of (byType['Activity'] || []).slice(0, 10)) {
    console.log(`- [${a.timestamp}] Action: ${a.action} | User: ${a.userId} | Details: ${JSON.stringify(a.details)}`);
  }

  console.log('\n--- Transactions Logged (' + (byType['Transaction'] || []).length + ') ---');
  for (const t of (byType['Transaction'] || []).slice(0, 5)) {
    console.log(`- ₹${t.amount} (${t.type}) ${t.description || t.category} on ${t.date}`);
  }
}

inspect()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
