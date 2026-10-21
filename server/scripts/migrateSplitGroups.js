const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SplitGroup = require('../models/SplitGroup');
const User = require('../models/User');

/**
 * Idempotent migration script for SplitGroup schema additions.
 *
 * For each SplitGroup:
 * 1. Links creator's member record with role='owner', status='active', userId=group.userId.
 * 2. Backfills role='member' and status='active' for other members.
 * 3. Populates createdBy on expenses and settlements.
 * 4. Migrates personalTransactionId / personalShareAmount to personalSync array.
 * 5. Ensures share subdocument structure exists with defaults.
 *
 * @param {Object} options
 * @param {boolean} [options.dryRun=false] - If true, calculate changes without saving
 * @param {boolean} [options.quiet=false] - Suppress console output
 * @returns {Promise<Object>} Migration statistics
 */
async function migrateSplitGroups(options = {}) {
  const { dryRun = false, quiet = false } = options;
  const log = (...args) => {
    if (!quiet) console.log(...args);
  };

  const groups = await SplitGroup.find({});
  log(`Found ${groups.length} split groups to inspect.`);

  let updatedCount = 0;
  let alreadyMigratedCount = 0;
  const errors = [];

  for (const group of groups) {
    try {
      let isModified = false;

      // 1. Ensure share structure
      if (!group.share || typeof group.share.enabled !== 'boolean') {
        group.share = {
          enabled: false,
          token: null,
          createdAt: group.createdAt || new Date(),
          expiresAt: null,
        };
        isModified = true;
      }

      // 2. Identify the owner member
      let ownerMember = null;
      if (group.ownerMemberId) {
        ownerMember = group.members.id(group.ownerMemberId);
      }

      if (!ownerMember && group.userId) {
        ownerMember = group.members.find(
          (m) => m.userId && m.userId.toString() === group.userId.toString()
        );
      }

      if (!ownerMember && group.userId) {
        // Try matching by email with the User record
        try {
          const creatorUser = await User.findById(group.userId);
          if (creatorUser && creatorUser.email) {
            const creatorEmail = creatorUser.email.toLowerCase();
            ownerMember = group.members.find(
              (m) => m.email && m.email.toLowerCase() === creatorEmail
            );
          }
        } catch {
          // ignore lookup failure
        }
      }

      if (!ownerMember && group.members.length > 0) {
        ownerMember = group.members[0];
      }

      if (ownerMember) {
        if (!ownerMember.userId && group.userId) {
          ownerMember.userId = group.userId;
          isModified = true;
        }
        if (ownerMember.role !== 'owner') {
          ownerMember.role = 'owner';
          isModified = true;
        }
        if (ownerMember.status !== 'active') {
          ownerMember.status = 'active';
          isModified = true;
        }
        if (!group.ownerMemberId || group.ownerMemberId.toString() !== ownerMember._id.toString()) {
          group.ownerMemberId = ownerMember._id;
          isModified = true;
        }
      }

      // 3. Update all other members
      for (const member of group.members) {
        if (ownerMember && member._id.toString() === ownerMember._id.toString()) {
          continue;
        }
        if (!member.role) {
          member.role = 'member';
          isModified = true;
        }
        if (!member.status) {
          member.status = 'active';
          isModified = true;
        }
      }

      // 4. Update expenses
      if (Array.isArray(group.expenses)) {
        for (const expense of group.expenses) {
          if (!expense.createdBy && group.userId) {
            expense.createdBy = group.userId;
            isModified = true;
          }

          if (
            expense.personalTransactionId &&
            (!expense.personalSync || expense.personalSync.length === 0)
          ) {
            expense.personalSync = [
              {
                userId: group.userId,
                amount: expense.personalShareAmount || 0,
                transactionId: expense.personalTransactionId,
              },
            ];
            isModified = true;
          }
        }
      }

      // 5. Update settlements
      if (Array.isArray(group.settlements)) {
        for (const settlement of group.settlements) {
          if (!settlement.createdBy && group.userId) {
            settlement.createdBy = group.userId;
            isModified = true;
          }
        }
      }

      if (isModified) {
        if (!dryRun) {
          await group.save();
        }
        updatedCount += 1;
      } else {
        alreadyMigratedCount += 1;
      }
    } catch (err) {
      errors.push({ groupId: group._id, error: err.message });
      log(`Error migrating group ${group._id}:`, err.message);
    }
  }

  log(`Migration complete. Updated: ${updatedCount}, Already Migrated: ${alreadyMigratedCount}, Errors: ${errors.length}`);

  return {
    totalGroups: groups.length,
    updatedCount,
    alreadyMigratedCount,
    errors,
  };
}

if (require.main === module) {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/finsight';
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log('Connected to MongoDB for migration');
      const isDryRun = process.argv.includes('--dry-run');
      await migrateSplitGroups({ dryRun: isDryRun });
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrateSplitGroups };
