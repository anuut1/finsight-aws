const mongoose = require('mongoose');
const { connectTestDb, clearTestDb, closeTestDb } = require('./setupTestDb');
const User = require('../models/User');
const RecurringTemplate = require('../models/RecurringTemplate');
const Transaction = require('../models/Transaction');
const {
  detectSubscription,
  calculateNextDueDate,
  syncTransactionSubscription,
  sendUpcomingSubscriptionReminders,
} = require('../services/subscriptionService');

describe('Subscription Recognition & Due Date Reminders', () => {
  let user;

  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    user = await User.create({
      name: 'Anushree',
      email: 'anushree.test@example.com',
      password: 'hashedpassword123',
    });
  });

  describe('detectSubscription', () => {
    it('detects Netflix from various payment text descriptions', () => {
      expect(detectSubscription('Netflix subscription')).toMatchObject({
        name: 'Netflix',
        category: 'Entertainment',
        frequency: 'monthly',
        logo: '🍿',
      });
      expect(detectSubscription('Paid to NETFLIX MUMBAI UPI')).toMatchObject({
        name: 'Netflix',
      });
    });

    it('detects Spotify Premium from payment text', () => {
      expect(detectSubscription('Spotify India')).toMatchObject({
        name: 'Spotify',
        category: 'Entertainment',
        frequency: 'monthly',
        logo: '🎵',
      });
    });

    it('returns null for one-off regular expenses', () => {
      expect(detectSubscription('Swiggy order #1234')).toBeNull();
      expect(detectSubscription('Blinkit groceries')).toBeNull();
    });
  });

  describe('calculateNextDueDate', () => {
    it('accurately advances by 1 month for monthly frequency', () => {
      const paymentDate = new Date('2026-10-21T10:00:00Z');
      const nextDue = calculateNextDueDate(paymentDate, 'monthly', 21);
      expect(nextDue.getMonth()).toBe(10); // November (0-indexed 10 = Nov)
      expect(nextDue.getDate()).toBe(21);
      expect(nextDue.getFullYear()).toBe(2026);
    });

    it('advances by 1 year for yearly subscriptions', () => {
      const paymentDate = new Date('2026-10-21T10:00:00Z');
      const nextDue = calculateNextDueDate(paymentDate, 'yearly', 21);
      expect(nextDue.getFullYear()).toBe(2027);
      expect(nextDue.getMonth()).toBe(9); // October
    });
  });

  describe('syncTransactionSubscription (Auto-Creation & Due Date Scheduling)', () => {
    it('automatically creates a RecurringTemplate when Netflix payment is recorded', async () => {
      const paymentDate = new Date('2026-10-21T12:00:00Z');
      const result = await syncTransactionSubscription({
        userId: user._id,
        description: 'Netflix Premium Plan',
        amount: 649,
        date: paymentDate,
        paymentMethod: 'Credit Card',
      });

      expect(result).not.toBeNull();
      expect(result.detected).toBe(true);
      expect(result.name).toBe('Netflix');
      expect(result.isNew).toBe(true);
      expect(result.amount).toBe(649);
      expect(result.nextDueDate.getMonth()).toBe(10); // Nov
      expect(result.nextDueDate.getDate()).toBe(21);

      // Verify in MongoDB
      const saved = await RecurringTemplate.findOne({ userId: user._id, name: 'Netflix' });
      expect(saved).not.toBeNull();
      expect(saved.status).toBe('active');
      expect(saved.amount).toBe(649);
      expect(saved.billingDay).toBe(21);
    });

    it('updates existing template and advances due date on recurring payment', async () => {
      // 1. Initial payment in September
      await syncTransactionSubscription({
        userId: user._id,
        description: 'Spotify Monthly Subscription',
        amount: 119,
        date: new Date('2026-09-15T10:00:00Z'),
      });

      // 2. Next payment in October
      const result2 = await syncTransactionSubscription({
        userId: user._id,
        description: 'Spotify Monthly Subscription',
        amount: 119,
        date: new Date('2026-10-15T10:00:00Z'),
      });

      expect(result2.isNew).toBe(false);
      expect(result2.nextDueDate.getMonth()).toBe(10); // Nov
      expect(result2.nextDueDate.getDate()).toBe(15);

      const all = await RecurringTemplate.find({ userId: user._id, name: 'Spotify' });
      expect(all.length).toBe(1); // Upserted without duplicating
    });
  });

  describe('sendUpcomingSubscriptionReminders', () => {
    it('identifies subscriptions due within the next 3 days', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await RecurringTemplate.create({
        userId: user._id,
        name: 'Netflix',
        amount: 649,
        category: 'Entertainment',
        frequency: 'monthly',
        billingDay: tomorrow.getDate(),
        nextDueDate: tomorrow,
        status: 'active',
      });

      const sweep = await sendUpcomingSubscriptionReminders(3);
      expect(sweep.totalChecked).toBe(1);
      expect(sweep.remindersSent).toBe(1);
      expect(sweep.details[0].name).toBe('Netflix');
      expect(sweep.details[0].userEmail).toBe('anushree.test@example.com');
    });
  });
});
