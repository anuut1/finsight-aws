const dynamoService = require('../services/dynamoService');
const { dynamoDocClient } = require('../services/dynamoClient');

jest.mock('../services/dynamoClient', () => {
  return {
    dynamoDocClient: {
      send: jest.fn(),
    },
    CORE_TABLE: 'finsight-core-test',
    EPHEMERAL_TABLE: 'finsight-ephemeral-test',
  };
});

describe('DynamoDB Single-Table Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('User Operations', () => {
    it('should save a user item with proper single-table keys and GSI1 for email', async () => {
      dynamoDocClient.send.mockResolvedValue({});

      const user = await dynamoService.putUser({
        userId: 'u-123',
        name: 'Jane Doe',
        email: 'JANE@EXAMPLE.COM',
        password: 'hashedPassword',
      });

      expect(user.PK).toBe('USER#u-123');
      expect(user.SK).toBe('PROFILE');
      expect(user.GSI1PK).toBe('EMAIL#jane@example.com');
      expect(user.GSI1SK).toBe('USER#u-123');
      expect(dynamoDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('should retrieve a user by ID', async () => {
      dynamoDocClient.send.mockResolvedValue({
        Item: {
          PK: 'USER#u-123',
          SK: 'PROFILE',
          userId: 'u-123',
          name: 'Jane Doe',
          email: 'jane@example.com',
        },
      });

      const user = await dynamoService.getUserById('u-123');
      expect(user).toBeDefined();
      expect(user.userId).toBe('u-123');
      expect(user.name).toBe('Jane Doe');
    });

    it('should query user by email via GSI1', async () => {
      dynamoDocClient.send.mockResolvedValue({
        Items: [
          {
            PK: 'USER#u-123',
            SK: 'PROFILE',
            userId: 'u-123',
            email: 'jane@example.com',
          },
        ],
      });

      const user = await dynamoService.getUserByEmail('jane@example.com');
      expect(user).toBeDefined();
      expect(user.userId).toBe('u-123');
    });
  });

  describe('Activity & Audit Log Operations', () => {
    it('should record an activity event with GSI1 for all-activity querying', async () => {
      dynamoDocClient.send.mockResolvedValue({});

      const activity = await dynamoService.logActivity({
        userId: 'u-123',
        action: 'SUBSCRIPTION_DETECTED',
        details: { serviceName: 'Netflix', amount: 649 },
        ip: '127.0.0.1',
      });

      expect(activity.PK).toBe('USER#u-123');
      expect(activity.SK).toMatch(/^ACTIVITY#/);
      expect(activity.GSI1PK).toBe('ACTIVITIES');
      expect(activity.details.serviceName).toBe('Netflix');
      expect(dynamoDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('should retrieve user activity history', async () => {
      dynamoDocClient.send.mockResolvedValue({
        Items: [
          {
            activityId: 'act-1',
            action: 'USER_LOGIN',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      const activities = await dynamoService.getUserActivities('u-123');
      expect(activities.length).toBe(1);
      expect(activities[0].action).toBe('USER_LOGIN');
    });
  });

  describe('Recurring Template & Subscriptions', () => {
    it('should put a recurring subscription template with nextDueDate in GSI1', async () => {
      dynamoDocClient.send.mockResolvedValue({});

      const sub = await dynamoService.putRecurringTemplate({
        templateId: 'sub-456',
        userId: 'u-123',
        name: 'Spotify Premium',
        amount: 119,
        category: 'Entertainment',
        nextDueDate: '2026-11-21T00:00:00.000Z',
      });

      expect(sub.PK).toBe('USER#u-123');
      expect(sub.SK).toBe('SUB#sub-456');
      expect(sub.GSI1PK).toBe('STATUS#active');
      expect(sub.GSI1SK).toBe('DUEDATE#2026-11-21T00:00:00.000Z');
      expect(dynamoDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('should query due subscriptions for automated reminders', async () => {
      dynamoDocClient.send.mockResolvedValue({
        Items: [
          {
            templateId: 'sub-456',
            name: 'Spotify Premium',
            nextDueDate: '2026-10-22T00:00:00.000Z',
          },
        ],
      });

      const due = await dynamoService.getDueSubscriptions(new Date('2026-10-23T00:00:00.000Z'));
      expect(due.length).toBe(1);
      expect(due[0].name).toBe('Spotify Premium');
    });
  });

  describe('Ephemeral Operations', () => {
    it('should store ephemeral job with TTL', async () => {
      dynamoDocClient.send.mockResolvedValue({});

      const job = await dynamoService.putEphemeralJob('job-789', {
        status: 'completed',
        extractedVendor: 'Starbucks',
      });

      expect(job.PK).toBe('RECEIPT_JOB#job-789');
      expect(job.SK).toBe('METADATA');
      expect(job.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });
});
