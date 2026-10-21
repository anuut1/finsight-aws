import { useEffect, useState } from 'react';
import Card from '../components/Card.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import Modal from '../components/Modal.jsx';
import Button from '../components/Button.jsx';
import api from '../api/axios.js';

const BudgetsPage = () => {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ category: '', limit: '' });
  const [saving, setSaving] = useState(false);

  const fetchBudgets = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/budgets');
      if (res.data?.success) {
        setBudgets(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load budgets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets();
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
      const res = await api.post('/budgets', {
        category: form.category,
        limit: Number(form.limit),
      });
      if (res.data?.success) {
        setBudgets((prev) => [...prev, res.data.data]);
        setForm({ category: '', limit: '' });
        setModalOpen(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create budget');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this budget?')) return;
    try {
      const res = await api.delete(`/budgets/${id}`);
      if (res.data?.success) {
        setBudgets((prev) => prev.filter((b) => b._id !== id));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete budget');
    }
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
          <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 700 }}>Budgets</h1>
          <p className="text-muted" style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
            Allocate monthly spending caps per category and track limits in real time.
          </p>
        </div>
        <Button type="button" variant="primary" onClick={() => setModalOpen(true)}>
          + Add budget
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
            Loading budgets...
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
          {budgets.length === 0 && (
            <Card style={{ padding: '1.5rem', gridColumn: '1 / -1', textAlign: 'center' }}>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                No budgets configured yet. Create a category budget to keep spending in check.
              </p>
            </Card>
          )}
          {budgets.map((b) => {
            const spent = b.spent || 0;
            const limit = b.limit || 1;
            const percent = limit > 0 ? (spent / limit) * 100 : 0;
            const over = percent > 100;
            const nearLimit = percent >= 80 && !over;
            const remaining = Math.max(0, limit - spent);

            return (
              <Card key={b._id} style={{ padding: '1.2rem 1.3rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.6rem',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 650, color: 'var(--text-primary)' }}>
                      {b.category}
                    </div>
                    <div className="text-muted num-tabular" style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                      Cap: ₹{Number(b.limit).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(b._id)}
                  >
                    Remove
                  </Button>
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
                  <span className="num-tabular" style={{ fontWeight: 600, color: over ? 'var(--color-negative)' : 'var(--text-primary)' }}>
                    ₹{Number(spent).toLocaleString('en-IN')} <span className="text-muted" style={{ fontWeight: 400 }}>spent</span>
                  </span>
                  <span
                    className="num-tabular"
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: over ? 'var(--color-negative)' : nearLimit ? 'var(--color-warning)' : 'var(--color-positive)',
                    }}
                  >
                    {percent.toFixed(0)}%
                  </span>
                </div>

                <ProgressBar value={percent} />

                <div
                  style={{
                    marginTop: '0.65rem',
                    fontSize: '0.76rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: over ? 'var(--color-negative)' : nearLimit ? 'var(--color-warning)' : 'var(--color-positive)',
                    fontWeight: 500,
                  }}
                >
                  {over ? (
                    <>⚠️ Over budget by ₹{(spent - limit).toLocaleString('en-IN')}</>
                  ) : nearLimit ? (
                    <>⚡ Close to limit — ₹{remaining.toLocaleString('en-IN')} left</>
                  ) : (
                    <>✓ ₹{remaining.toLocaleString('en-IN')} remaining this month</>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        title="Create budget"
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
      >
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
              Category
            </label>
            <input
              name="category"
              value={form.category}
              onChange={handleChange}
              className="input-glass"
              placeholder="e.g. Groceries"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
              Monthly limit
            </label>
            <input
              type="number"
              name="limit"
              value={form.limit}
              onChange={handleChange}
              className="input-glass"
              placeholder="e.g. 5000"
            />
          </div>
          <Button variant="primary" type="submit" loading={saving} fullWidth>
            Save budget
          </Button>
        </form>
      </Modal>
    </>
  );
};

export default BudgetsPage;

