import { useState, useEffect } from 'react';
import api from '../api/axios';
import GlassCard from './GlassCard';
import Modal from './Modal';
import Button from './Button';

const CATEGORIES = [
  'Bills & Utilities',
  'Entertainment',
  'Food & Dining',
  'Groceries',
  'Shopping',
  'Travel',
  'Healthcare',
  'Education',
  'Investment',
  'Personal Care',
  'Other',
];

const PAYMENT_METHODS = ['UPI', 'Credit Card', 'Debit Card', 'Auto-Debit', 'Net Banking', 'Cash', 'Other'];

const RecurringTemplatesWidget = ({ onTransactionLogged }) => {
  const [data, setData] = useState({ templates: [], totalMonthlyCommitment: 0, activeCount: 0, dueSoonCount: 0 });
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [loggingId, setLoggingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state for creating a new template
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Bills & Utilities');
  const [frequency, setFrequency] = useState('monthly');
  const [billingDay, setBillingDay] = useState('5');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [nextDueDate, setNextDueDate] = useState('');

  const fetchTemplates = async () => {
    try {
      const res = await api.get('/recurring');
      if (res.data?.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.warn('Could not load recurring templates:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleLogPayment = async (template) => {
    setLoggingId(template._id);
    try {
      const res = await api.post(`/recurring/${template._id}/log`);
      if (res.data?.success) {
        fetchTemplates();
        if (onTransactionLogged) {
          onTransactionLogged(res.data.data.transaction);
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to log recurring transaction');
    } finally {
      setLoggingId(null);
    }
  };

  const handleInitPresets = async () => {
    setSubmitting(true);
    try {
      const res = await api.post('/recurring/presets');
      if (res.data?.success) {
        fetchTemplates();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to load presets');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    if (!name.trim() || !amount) {
      setError('Please provide a name and amount');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await api.post('/recurring', {
        name: name.trim(),
        amount: Number(amount),
        category,
        frequency,
        billingDay: Number(billingDay) || 1,
        paymentMethod,
        nextDueDate: nextDueDate || undefined,
      });

      if (res.data?.success) {
        fetchTemplates();
        setModalOpen(false);
        setName('');
        setAmount('');
        setNextDueDate('');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create recurring template');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Delete this recurring template?')) return;
    try {
      const res = await api.delete(`/recurring/${id}`);
      if (res.data?.success) {
        fetchTemplates();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete template');
    }
  };

  const handleToggleStatus = async (template) => {
    const newStatus = template.status === 'active' ? 'paused' : 'active';
    try {
      const res = await api.put(`/recurring/${template._id}`, { status: newStatus });
      if (res.data?.success) {
        fetchTemplates();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update template');
    }
  };

  const formatDueDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  const templates = data.templates || [];

  return (
    <GlassCard style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
            Upcoming Payments & Subscriptions
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setModalOpen(true)}
            style={{
              color: 'var(--accent-primary-light)',
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '2px 8px',
              minHeight: '28px',
            }}
          >
            ⚙️ Manage
          </Button>
        </div>

        <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>Recurring templates & auto-commitments</span>
          {data.totalMonthlyCommitment > 0 && (
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              ₹{data.totalMonthlyCommitment.toLocaleString('en-IN')} / mo
            </span>
          )}
        </div>

        {/* List of Recurring Items */}
        {loading ? (
          <div className="text-muted" style={{ fontSize: '0.8rem', padding: '1rem 0' }}>
            Loading commitments...
          </div>
        ) : templates.length === 0 ? (
          <div
            style={{
              padding: '1rem',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.4rem', marginBottom: '0.35rem' }}>🔁</div>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              No recurring templates yet
            </div>
            <p className="text-muted" style={{ fontSize: '0.75rem', margin: '0.3rem 0 0.85rem' }}>
              Track rent, Netflix, WiFi, electricity, or SIPs with one-tap payment logging.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleInitPresets}
                disabled={submitting}
                loading={submitting}
                style={{ fontSize: '0.75rem', padding: '5px 12px' }}
              >
                ⚡ Load Standard Presets
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setModalOpen(true)}
                style={{ fontSize: '0.75rem', padding: '5px 12px' }}
              >
                + Custom
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ maxHeight: '235px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {templates.slice(0, 6).map((item) => {
              const isLogging = loggingId === item._id;
              const dueTagColor = item.isOverdue
                ? 'var(--accent-danger)'
                : item.isDueToday
                ? 'var(--accent-warning)'
                : 'var(--accent-primary)';

              return (
                <div
                  key={item._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.55rem 0.65rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    marginBottom: '0.45rem',
                    opacity: item.status === 'paused' ? 0.6 : 1,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.15rem' }}>{item.logo}</span>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Due {formatDueDate(item.nextDueDate)}
                        {item.status === 'paused' && ' (Paused)'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, color: 'var(--accent-primary-light)', fontSize: '0.82rem' }}>
                        ₹{item.amount.toLocaleString('en-IN')}
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', justifyContent: 'flex-end', marginTop: '0.1rem' }}>
                        <span
                          style={{
                            fontSize: '0.6rem',
                            padding: '1px 5px',
                            background: 'var(--bg-light)',
                            color: dueTagColor,
                            borderRadius: '999px',
                            fontWeight: 600,
                          }}
                        >
                          {item.isOverdue
                            ? 'Overdue'
                            : item.isDueToday
                            ? 'Today'
                            : `${item.daysUntilDue}d`}
                        </span>
                      </div>
                    </div>

                    {/* One-tap Log Payment Button */}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      title="Click to log this payment now"
                      aria-label={`Log payment for ${item.name}`}
                      onClick={() => handleLogPayment(item)}
                      disabled={isLogging || item.status === 'paused'}
                      loading={isLogging}
                      style={{
                        padding: '4px 10px',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: 'var(--accent-success)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ✓ Log
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Full Recurring Templates Management */}
      <Modal
        title="🔁 Manage Recurring Templates"
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
          {/* Add Template Form */}
          <form
            onSubmit={handleCreateTemplate}
            style={{
              padding: '0.85rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.65rem', color: 'var(--text-primary)' }}>
              + Add New Recurring Template
            </div>

            {error && (
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--accent-danger)',
                  marginBottom: '0.5rem',
                }}
              >
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>NAME</label>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="e.g. Rent, Netflix, WiFi, Gym"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>AMOUNT (₹)</label>
                <input
                  type="number"
                  min="0"
                  className="input-glass"
                  placeholder="1200"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>CATEGORY</label>
                <select className="input-glass" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>FREQUENCY</label>
                <select className="input-glass" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="weekly">Weekly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="daily">Daily</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>BILLING DAY</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  className="input-glass"
                  value={billingDay}
                  onChange={(e) => setBillingDay(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>PAYMENT METHOD</label>
                <select className="input-glass" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>NEXT DUE DATE (OPTIONAL)</label>
                <input
                  type="date"
                  className="input-glass"
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={submitting}
                loading={submitting}
                style={{ fontSize: '0.78rem', padding: '5px 14px' }}
              >
                Save Template
              </Button>
            </div>
          </form>

          {/* List of Existing Templates */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              CURRENT TEMPLATES ({templates.length})
            </div>

            {templates.length === 0 ? (
              <div className="text-muted" style={{ fontSize: '0.78rem', textAlign: 'center', padding: '1rem' }}>
                No templates configured yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {templates.map((t) => (
                  <div
                    key={t._id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.8rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '1.2rem' }}>{t.logo}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                          {t.name}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                          ₹{t.amount.toLocaleString('en-IN')} • {t.frequency} • {t.paymentMethod} • Due {formatDueDate(t.nextDueDate)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleLogPayment(t)}
                        disabled={loggingId === t._id || t.status === 'paused'}
                        loading={loggingId === t._id}
                        aria-label={`Log payment for ${t.name}`}
                        style={{
                          padding: '3px 8px',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: 'var(--accent-success)',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                        }}
                      >
                        ✓ Log
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleToggleStatus(t)}
                        aria-label={`${t.status === 'active' ? 'Pause' : 'Resume'} ${t.name}`}
                        style={{
                          padding: '3px 8px',
                          color: 'var(--text-secondary)',
                          fontSize: '0.7rem',
                        }}
                      >
                        {t.status === 'active' ? 'Pause' : 'Resume'}
                      </Button>

                      <button
                        type="button"
                        className="btn-icon-round"
                        onClick={() => handleDeleteTemplate(t._id)}
                        aria-label={`Delete ${t.name}`}
                        title="Delete"
                        style={{
                          width: '28px',
                          height: '28px',
                          color: 'var(--accent-danger)',
                          fontSize: '0.8rem',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </GlassCard>
  );
};

export default RecurringTemplatesWidget;
