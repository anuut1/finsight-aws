import { useEffect, useState } from 'react';
import Card from '../components/Card.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import Modal from '../components/Modal.jsx';
import Button from '../components/Button.jsx';
import api from '../api/axios.js';
import { triggerConfetti } from '../utils/confetti.js';

const GoalsPage = () => {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    targetAmount: '',
    savedAmount: '',
    deadline: '',
  });
  const [saving, setSaving] = useState(false);
  const [activeGoal, setActiveGoal] = useState(null);
  const [fundAmount, setFundAmount] = useState('');

  const fetchGoals = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/goals');
      if (res.data?.success) {
        setGoals(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title,
        targetAmount: Number(form.targetAmount),
        savedAmount: form.savedAmount ? Number(form.savedAmount) : 0,
        deadline: form.deadline,
      };
      const res = await api.post('/goals', payload);
      if (res.data?.success) {
        setGoals((prev) => [...prev, res.data.data]);
        if (payload.savedAmount >= payload.targetAmount) {
          triggerConfetti();
        }
        setForm({ title: '', targetAmount: '', savedAmount: '', deadline: '' });
        setModalOpen(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create goal');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this goal?')) return;
    try {
      const res = await api.delete(`/goals/${id}`);
      if (res.data?.success) {
        setGoals((prev) => prev.filter((g) => g._id !== id));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete goal');
    }
  };

  const handleAddFunds = async () => {
    if (!activeGoal) return;
    const amount = Number(fundAmount);
    if (!amount) return;
    try {
      const newSaved = (activeGoal.savedAmount || 0) + amount;
      const willComplete = newSaved >= activeGoal.targetAmount && (activeGoal.savedAmount || 0) < activeGoal.targetAmount;
      const status = newSaved >= activeGoal.targetAmount ? 'completed' : activeGoal.status;
      const res = await api.put(`/goals/${activeGoal._id}`, {
        savedAmount: newSaved,
        status,
      });
      if (res.data?.success) {
        setGoals((prev) =>
          prev.map((g) => (g._id === activeGoal._id ? res.data.data : g))
        );
        if (willComplete) {
          triggerConfetti();
        }
        setActiveGoal(null);
        setFundAmount('');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add funds');
    }
  };

  const openFundModal = (goal) => {
    setActiveGoal(goal);
    setFundAmount('');
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 700 }}>Goals</h1>
          <p className="text-muted" style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
            Track long-term savings targets and celebrate milestone progress.
          </p>
        </div>
        <Button type="button" variant="primary" onClick={() => setModalOpen(true)}>
          + Add goal
        </Button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.65rem 0.95rem',
            borderRadius: 'var(--radius-md, 12px)',
            background: 'var(--color-negative-bg)',
            color: 'var(--color-negative)',
            border: '1px solid var(--color-negative-border)',
            fontSize: '0.82rem',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <Card style={{ padding: '1.25rem 1.4rem' }}>
          <p className="text-muted" style={{ margin: 0 }}>
            Loading goals...
          </p>
        </Card>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}
        >
          {goals.length === 0 && (
            <Card style={{ padding: '1.5rem', gridColumn: '1 / -1', textAlign: 'center' }}>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                No goals yet. Create a savings target to begin tracking milestones.
              </p>
            </Card>
          )}
          {goals.map((g) => {
            const progress =
              g.targetAmount > 0
                ? Math.min(100, (g.savedAmount / g.targetAmount) * 100)
                : 0;
            const isCompleted = g.status === 'completed' || progress >= 100;

            return (
              <Card key={g._id} style={{ padding: '1.25rem 1.35rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.6rem',
                    gap: '0.5rem',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 650, color: 'var(--text-primary)' }}>
                      {g.title}
                    </div>
                    <div className="text-muted num-tabular" style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                      Target: ₹{Number(g.targetAmount).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-full)',
                      background: isCompleted ? 'var(--color-positive-bg)' : 'var(--color-accent-subtle)',
                      color: isCompleted ? 'var(--color-positive)' : 'var(--color-accent)',
                      border: `1px solid ${isCompleted ? 'var(--color-positive-border)' : 'var(--border-strong)'}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isCompleted ? '✓ Reached' : `${progress.toFixed(0)}% saved`}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: '0.45rem',
                    fontSize: '0.84rem',
                  }}
                >
                  <span className="num-tabular" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    ₹{Number(g.savedAmount).toLocaleString('en-IN')}{' '}
                    <span className="text-muted" style={{ fontWeight: 400 }}>
                      of ₹{Number(g.targetAmount).toLocaleString('en-IN')}
                    </span>
                  </span>
                </div>

                <ProgressBar value={progress} />

                <div
                  style={{
                    marginTop: '0.55rem',
                    fontSize: '0.76rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Deadline: {new Date(g.deadline).toLocaleDateString()}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '0.85rem',
                    paddingTop: '0.65rem',
                    borderTop: '1px solid var(--border-color)',
                  }}
                >
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => openFundModal(g)}
                  >
                    + Add funds
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(g._id)}
                  >
                    Remove
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        title="Create goal"
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
      >
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
              Title
            </label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              className="input-glass"
              placeholder="e.g. Emergency fund"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
              Target amount
            </label>
            <input
              type="number"
              name="targetAmount"
              value={form.targetAmount}
              onChange={handleChange}
              className="input-glass"
              placeholder="e.g. 50000"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
              Already saved (optional)
            </label>
            <input
              type="number"
              name="savedAmount"
              value={form.savedAmount}
              onChange={handleChange}
              className="input-glass"
              placeholder="e.g. 10000"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
              Deadline
            </label>
            <input
              type="date"
              name="deadline"
              value={form.deadline}
              onChange={handleChange}
              className="input-glass"
            />
          </div>
          <Button variant="primary" type="submit" loading={saving} fullWidth>
            Save goal
          </Button>
        </form>
      </Modal>

      <Modal
        title={activeGoal ? `Add funds to ${activeGoal.title}` : 'Add funds'}
        isOpen={!!activeGoal}
        onClose={() => setActiveGoal(null)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>
            Current saved: ₹{activeGoal?.savedAmount.toFixed(0) ?? 0}
          </div>
          <input
            type="number"
            value={fundAmount}
            onChange={(e) => setFundAmount(e.target.value)}
            className="input-glass"
            placeholder="Amount to add"
          />
          <Button variant="primary" type="button" onClick={handleAddFunds} fullWidth>
            Add funds
          </Button>
        </div>
      </Modal>
    </>
  );
};

export default GoalsPage;

