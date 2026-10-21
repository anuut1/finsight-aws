const RecurringTemplate = require('../models/RecurringTemplate');
const Transaction = require('../models/Transaction');

const advanceDueDate = (currentDate, frequency, billingDay = 1) => {
  const next = new Date(currentDate);

  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (frequency === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else if (frequency === 'quarterly') {
    next.setMonth(next.getMonth() + 3);
  } else {
    // monthly default
    next.setMonth(next.getMonth() + 1);
    // Adjust day if month has fewer days
    if (billingDay) {
      const maxDays = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(billingDay, maxDays));
    }
  }

  return next;
};

const getLogoEmoji = (name = '', category = '') => {
  const n = name.toLowerCase();
  const c = category.toLowerCase();

  if (n.includes('netflix')) return '🍿';
  if (n.includes('spotify') || n.includes('music') || n.includes('apple music')) return '🎵';
  if (n.includes('rent') || n.includes('house') || n.includes('flat')) return '🏠';
  if (n.includes('wifi') || n.includes('internet') || n.includes('broadband') || n.includes('fiber')) return '🌐';
  if (n.includes('electric') || n.includes('power') || n.includes('light')) return '⚡';
  if (n.includes('water')) return '💧';
  if (n.includes('gym') || n.includes('fitness')) return '💪';
  if (n.includes('chatgpt') || n.includes('claude') || n.includes('ai')) return '🤖';
  if (n.includes('sip') || n.includes('mutual') || n.includes('stock') || c.includes('invest')) return '📈';
  if (n.includes('prime') || n.includes('amazon')) return '📦';
  if (n.includes('mobile') || n.includes('recharge') || n.includes('phone') || n.includes('airtel') || n.includes('jio')) return '📱';
  if (n.includes('salary') || n.includes('income')) return '💰';
  if (c.includes('bill')) return '📄';
  return '🔁';
};

const serializeTemplate = (template) => {
  const obj = template.toObject ? template.toObject() : template;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(obj.nextDueDate);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - today.getTime();
  const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    ...obj,
    logo: getLogoEmoji(obj.name, obj.category),
    daysUntilDue,
    isOverdue: daysUntilDue < 0,
    isDueToday: daysUntilDue === 0,
    isDueSoon: daysUntilDue >= 0 && daysUntilDue <= 5,
  };
};

exports.getRecurringTemplates = async (req, res) => {
  try {
    const templates = await RecurringTemplate.find({ userId: req.user.id }).sort({
      nextDueDate: 1,
    });

    const serialized = templates.map(serializeTemplate);

    // Calculate monthly commitment total
    const totalMonthlyCommitment = serialized
      .filter((t) => t.status === 'active' && t.type === 'expense')
      .reduce((sum, t) => {
        let monthly = t.amount;
        if (t.frequency === 'yearly') monthly = t.amount / 12;
        if (t.frequency === 'quarterly') monthly = t.amount / 3;
        if (t.frequency === 'weekly') monthly = t.amount * 4.33;
        if (t.frequency === 'daily') monthly = t.amount * 30;
        return sum + monthly;
      }, 0);

    return res.json({
      success: true,
      data: {
        templates: serialized,
        totalMonthlyCommitment: Math.round(totalMonthlyCommitment),
        activeCount: serialized.filter((t) => t.status === 'active').length,
        dueSoonCount: serialized.filter((t) => t.status === 'active' && (t.isDueSoon || t.isOverdue)).length,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.createRecurringTemplate = async (req, res) => {
  try {
    const {
      name,
      amount,
      type = 'expense',
      category = 'Bills & Utilities',
      frequency = 'monthly',
      billingDay = 1,
      nextDueDate,
      paymentMethod = 'UPI',
      autoLog = false,
      tags = [],
      note = '',
    } = req.body;

    if (!name || !amount) {
      return res.status(400).json({ success: false, message: 'Name and amount are required' });
    }

    let dueDate = nextDueDate ? new Date(nextDueDate) : new Date();
    if (isNaN(dueDate.getTime())) {
      dueDate = new Date();
      dueDate.setDate(Number(billingDay) || 1);
      if (dueDate < new Date()) {
        dueDate.setMonth(dueDate.getMonth() + 1);
      }
    }

    const template = await RecurringTemplate.create({
      userId: req.user.id,
      name: name.trim(),
      amount: Number(amount),
      type,
      category,
      frequency,
      billingDay: Number(billingDay) || 1,
      nextDueDate: dueDate,
      paymentMethod,
      autoLog: Boolean(autoLog),
      tags: Array.isArray(tags) ? tags : [],
      note: note.trim(),
    });

    return res.status(201).json({ success: true, data: serializeTemplate(template) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.updateRecurringTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await RecurringTemplate.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      req.body,
      { new: true }
    );

    if (!template) {
      return res.status(404).json({ success: false, message: 'Recurring template not found' });
    }

    return res.json({ success: true, data: serializeTemplate(template) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.deleteRecurringTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await RecurringTemplate.findOneAndDelete({
      _id: id,
      userId: req.user.id,
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Recurring template not found' });
    }

    return res.json({ success: true, data: template });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.logRecurringPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await RecurringTemplate.findOne({
      _id: id,
      userId: req.user.id,
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Recurring template not found' });
    }

    // 1. Create personal transaction
    const now = new Date();
    const transaction = await Transaction.create({
      userId: req.user.id,
      type: template.type,
      category: template.category,
      amount: template.amount,
      description: `${template.name} (${template.frequency} payment)`,
      date: now,
      tags: ['recurring', template.name, template.paymentMethod],
      mood: 'neutral',
      source: 'manual',
    });

    // 2. Advance template due date to the next cycle
    const nextDue = advanceDueDate(template.nextDueDate, template.frequency, template.billingDay);
    template.lastLoggedAt = now;
    template.nextDueDate = nextDue;
    await template.save();

    return res.status(201).json({
      success: true,
      data: {
        transaction,
        updatedTemplate: serializeTemplate(template),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.initStarterPresets = async (req, res) => {
  try {
    const existing = await RecurringTemplate.countDocuments({ userId: req.user.id });
    if (existing > 0) {
      return res.status(400).json({ success: false, message: 'User already has templates configured' });
    }

    const today = new Date();
    const presets = [
      { name: 'House Rent', amount: 15000, category: 'Bills & Utilities', frequency: 'monthly', billingDay: 1, paymentMethod: 'UPI' },
      { name: 'Netflix', amount: 649, category: 'Entertainment', frequency: 'monthly', billingDay: 5, paymentMethod: 'Credit Card' },
      { name: 'Spotify Premium', amount: 119, category: 'Entertainment', frequency: 'monthly', billingDay: 10, paymentMethod: 'UPI' },
      { name: 'High-Speed Broadband', amount: 899, category: 'Bills & Utilities', frequency: 'monthly', billingDay: 15, paymentMethod: 'UPI' },
      { name: 'Electricity Bill', amount: 1200, category: 'Bills & Utilities', frequency: 'monthly', billingDay: 20, paymentMethod: 'Auto-Debit' },
    ];

    const created = [];
    for (const p of presets) {
      const nextDue = new Date(today.getFullYear(), today.getMonth(), p.billingDay);
      if (nextDue < today) nextDue.setMonth(nextDue.getMonth() + 1);

      const doc = await RecurringTemplate.create({
        userId: req.user.id,
        ...p,
        nextDueDate: nextDue,
      });
      created.push(serializeTemplate(doc));
    }

    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
