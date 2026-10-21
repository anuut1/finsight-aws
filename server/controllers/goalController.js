const Goal = require('../models/Goal');

exports.getGoals = async (req, res) => {
  try {
    const goals = await Goal.find({ userId: req.user.id }).sort({ deadline: 1 });
    return res.json({ success: true, data: goals });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.createGoal = async (req, res) => {
  try {
    const { title, targetAmount, savedAmount = 0, deadline } = req.body;

    if (!title || !targetAmount || !deadline) {
      return res
        .status(400)
        .json({ success: false, message: 'Title, targetAmount and deadline are required' });
    }

    const goal = await Goal.create({
      userId: req.user.id,
      title,
      targetAmount,
      savedAmount,
      deadline,
    });

    return res.status(201).json({ success: true, data: goal });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.updateGoal = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};

    if (req.body.title) updates.title = req.body.title.trim();
    if (req.body.targetAmount !== undefined) updates.targetAmount = Number(req.body.targetAmount);
    if (req.body.savedAmount !== undefined) updates.savedAmount = Number(req.body.savedAmount);
    if (req.body.deadline) updates.deadline = req.body.deadline;
    if (req.body.status) updates.status = req.body.status;

    const existing = await Goal.findOne({ _id: id, userId: req.user.id });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    const newTarget = updates.targetAmount !== undefined ? updates.targetAmount : existing.targetAmount;
    const newSaved = updates.savedAmount !== undefined ? updates.savedAmount : existing.savedAmount;

    // Auto complete if saved reaches target and user didn't explicitly override status
    if (!req.body.status && newSaved >= newTarget) {
      updates.status = 'completed';
    } else if (!req.body.status && newSaved < newTarget && existing.status === 'completed') {
      updates.status = 'active';
    }

    const goal = await Goal.findOneAndUpdate({ _id: id, userId: req.user.id }, updates, {
      new: true,
    });

    return res.json({ success: true, data: goal });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.deleteGoal = async (req, res) => {
  try {
    const { id } = req.params;

    const goal = await Goal.findOneAndDelete({ _id: id, userId: req.user.id });

    if (!goal) {
      return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    return res.json({ success: true, data: goal });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

