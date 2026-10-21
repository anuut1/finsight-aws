import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import Card from './Card.jsx';
import Button from './Button.jsx';
import Modal from './Modal.jsx';
import Input from './Input.jsx';

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

/**
 * Quiet Ledger "Bills & subscriptions" Card
 *
 * - Left, largest card on the Dashboard
 * - Header shows total due this month
 * - Shows recurring bills and subscriptions with name, type, amount, due/renewal date,
 *   and status ("Due in 2 days" in warning color when within 3 days)
 * - Auto-pay flags, upcoming payment alerts, add/edit/delete, and logging
 * - Footer line shows auto-detected recurring charges and their monthly total from analytics
 * - "View all" link to the full Bills page
 */
const BillsAndSubscriptionsCard = ({ onTransactionLogged, className = '', style = {} }) => {
  const [data, setData] = useState({ templates: [], totalMonthlyCommitment: 0, activeCount: 0, dueSoonCount: 0 });
  const [loading, setLoading] = useState(true);
  const [detectedSubscriptions, setDetectedSubscriptions] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [loggingId, setLoggingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
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

  const fetchDetectedSubscriptions = async () => {
    try {
      const res = await api.get('/analytics/subscriptions');
      if (res.data?.success && Array.isArray(res.data.data)) {
        setDetectedSubscriptions(res.data.data);
      }
    } catch (err) {
      console.warn('Could not load detected subscriptions:', err.message);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchDetectedSubscriptions();
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
      alert(err.response?.data?.message || 'Failed to log payment');
    } finally {
      setLoggingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this bill/subscription?')) return;
    try {
      const res = await api.delete(`/recurring/${id}`);
      if (res.data?.success) {
        fetchTemplates();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const handleOpenAdd = () => {
    setEditingTemplate(null);
    setName('');
    setAmount('');
    setCategory('Bills & Utilities');
    setFrequency('monthly');
    setBillingDay('5');
    setPaymentMethod('UPI');
    setNextDueDate('');
    setError('');
    setModalOpen(true);
  };

  const handleOpenEdit = (t) => {
    setEditingTemplate(t);
    setName(t.name);
    setAmount(String(t.amount));
    setCategory(t.category || 'Bills & Utilities');
    setFrequency(t.frequency || 'monthly');
    setBillingDay(String(t.billingDay || 5));
    setPaymentMethod(t.paymentMethod || 'UPI');
    setNextDueDate(t.nextDueDate ? t.nextDueDate.slice(0, 10) : '');
    setError('');
    setModalOpen(true);
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!name.trim() || !amount) {
      setError('Please provide a name and amount');
      return;
    }

    setSubmitting(true);
    setError('');

    const payload = {
      name: name.trim(),
      amount: Number(amount),
      category,
      frequency,
      billingDay: Number(billingDay) || 1,
      paymentMethod,
      nextDueDate: nextDueDate || undefined,
    };

    try {
      if (editingTemplate) {
        await api.put(`/recurring/${editingTemplate._id}`, payload);
      } else {
        await api.post('/recurring', payload);
      }
      fetchTemplates();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setSubmitting(false);
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

  // Helper to calculate days until due
  const getDueStatus = (dueDateStr) => {
    if (!dueDateStr) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `Overdue by ${Math.abs(diffDays)}d`, isWarning: true };
    }
    if (diffDays === 0) {
      return { text: 'Due today', isWarning: true };
    }
    if (diffDays === 1) {
      return { text: 'Due tomorrow', isWarning: true };
    }
    if (diffDays <= 3) {
      return { text: `Due in ${diffDays} days`, isWarning: true };
    }
    return { text: `Due in ${diffDays} days`, isWarning: false };
  };

  const formatDueDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  const templates = data.templates || [];

  // Total auto-detected monthly cost
  const detectedMonthlyTotal = detectedSubscriptions.reduce(
    (sum, s) => sum + (Number(s.estimatedMonthlyCost) || 0),
    0
  );

  return (
    <Card style={{ padding: '2rem', ...style }} className={`bills-subscriptions-card ${className}`}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-heading, "Instrument Serif", serif)',
            fontSize: '1.75rem',
            margin: 0,
            fontWeight: 400,
            letterSpacing: '-0.01em',
          }}
        >
          Bills & subscriptions
        </h2>

        <Link
          to="/bills"
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
            fontWeight: 500,
          }}
        >
          View all
        </Link>
      </div>

      {/* Subtitle with total due this month */}
      <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
        <span className="num-tabular" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          ₹{data.totalMonthlyCommitment.toLocaleString('en-IN')}
        </span>{' '}
        due this month across {templates.length} recurring {templates.length === 1 ? 'charge' : 'charges'}.
      </p>

      {/* List of Recurring Items */}
      {loading ? (
        <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading bills & subscriptions...
        </div>
      ) : templates.length === 0 ? (
        <div
          style={{
            padding: '2.5rem 1rem',
            textAlign: 'center',
            border: '1px dashed var(--border-color)',
            borderRadius: 'var(--radius-input, 14px)',
            marginBottom: '1.5rem',
          }}
        >
          <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            No recurring bills or subscriptions tracked yet.
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="primary" size="sm" onClick={handleOpenAdd}>
              + Add first bill
            </Button>
            <Button variant="secondary" size="sm" onClick={handleInitPresets} disabled={submitting}>
              Load common presets
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {templates.map((t) => {
            const dueStatus = getDueStatus(t.nextDueDate);
            const isAutoPay = t.paymentMethod === 'Auto-Debit';
            const isLogging = loggingId === t._id;
            const isSubscription =
              t.category === 'Entertainment' ||
              t.frequency === 'monthly' ||
              (t.name && /netflix|spotify|prime|youtube|icloud|adobe|chatgpt/i.test(t.name));

            return (
              <div
                key={t._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-input, 14px)',
                  background: 'var(--bg-surface)',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                {/* Left details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {t.name}
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '1px 8px',
                        borderRadius: 'var(--radius-pill, 999px)',
                        background: 'var(--bg-surface-elevated)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {isSubscription ? 'Subscription' : 'Bill'}
                    </span>
                    {isAutoPay && (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          padding: '1px 8px',
                          borderRadius: 'var(--radius-pill, 999px)',
                          background: 'var(--color-positive-bg)',
                          color: 'var(--color-positive)',
                          border: '1px solid var(--color-positive-border)',
                        }}
                      >
                        Auto-pay
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {t.nextDueDate ? `Due ${formatDueDate(t.nextDueDate)}` : `Billed monthly on day ${t.billingDay}`}
                    {t.paymentMethod && !isAutoPay && ` • ${t.paymentMethod}`}
                  </div>
                </div>

                {/* Right amount and status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      className="num-tabular"
                      style={{
                        fontWeight: 600,
                        fontSize: '1.05rem',
                        color: 'var(--text-primary)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      ₹{Number(t.amount).toLocaleString('en-IN')}
                    </div>
                    {dueStatus && (
                      <div
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          color: dueStatus.isWarning ? 'var(--color-warning)' : 'var(--text-muted)',
                        }}
                      >
                        {dueStatus.text}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleLogPayment(t)}
                      loading={isLogging}
                      disabled={isLogging}
                      aria-label={`Record payment for ${t.name}`}
                      style={{ padding: '0 12px', height: '32px', fontSize: '0.78rem' }}
                    >
                      Paid
                    </Button>
                    <button
                      type="button"
                      className="btn-icon-round"
                      onClick={() => handleOpenEdit(t)}
                      aria-label={`Edit ${t.name}`}
                      style={{
                        width: '32px',
                        height: '32px',
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)',
                      }}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="btn-icon-round"
                      onClick={() => handleDelete(t._id)}
                      aria-label={`Delete ${t.name}`}
                      style={{
                        width: '32px',
                        height: '32px',
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)',
                      }}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add new button */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
        <Button variant="secondary" size="sm" onClick={handleOpenAdd}>
          + Add bill or subscription
        </Button>
      </div>

      {/* Footer line: Auto-detected recurring charges & monthly total */}
      <div
        style={{
          borderTop: '1px solid var(--border-color)',
          paddingTop: '1rem',
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <span>
          {detectedSubscriptions.length > 0 ? (
            <>
              Auto-detected{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {detectedSubscriptions.length} recurring {detectedSubscriptions.length === 1 ? 'charge' : 'charges'}
              </strong>{' '}
              from your transaction history.
            </>
          ) : (
            'Scan transaction history for auto-detected subscriptions.'
          )}
        </span>
        {detectedMonthlyTotal > 0 && (
          <span className="num-tabular" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            ~₹{detectedMonthlyTotal.toLocaleString('en-IN')}/mo detected
          </span>
        )}
      </div>

      {/* Add / Edit Bill Modal */}
      <Modal
        title={editingTemplate ? 'Edit Bill / Subscription' : 'Add Bill or Subscription'}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && <div className="inline-error">{error}</div>}

          <Input
            label="Name / Service"
            id="bill-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Electricity, Netflix, Wifi"
            required
          />

          <Input
            label="Amount (₹)"
            id="bill-amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 1499"
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="input-field">
              <label htmlFor="bill-category">Category</label>
              <select
                id="bill-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="form-input"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="input-field">
              <label htmlFor="bill-payment-method">Payment Method</label>
              <select
                id="bill-payment-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="form-input"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="input-field">
              <label htmlFor="bill-frequency">Frequency</label>
              <select
                id="bill-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="form-input"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <Input
              label="Next Due Date"
              id="bill-next-due"
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              {editingTemplate ? 'Save changes' : 'Add commitment'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
};

export default BillsAndSubscriptionsCard;
