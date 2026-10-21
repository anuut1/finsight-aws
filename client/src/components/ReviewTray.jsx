import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import ReviewCard from './ReviewCard.jsx';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import api from '../api/axios';

const CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Shopping',
  'Travel',
  'Entertainment',
  'Bills & Utilities',
  'Healthcare',
  'Education',
  'Personal Care',
  'Investment',
  'Salary',
  'Shared',
  'Other',
];

/**
 * ReviewTray
 *
 * Needs-review tray: draft transactions shown as swipeable cards.
 * Confirming a card slides it away and updates parent Safe to spend.
 */
const ReviewTray = ({
  drafts = [],
  onDraftConfirmed,
  onDraftsUpdated,
  className = '',
}) => {
  const [editingDraft, setEditingDraft] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  if (!drafts || drafts.length === 0) {
    return null;
  }

  const handleConfirm = async (draft) => {
    try {
      const res = await api.patch(`/transactions/drafts/${draft._id}/approve`, {});
      if (res.data?.success) {
        if (onDraftConfirmed) {
          onDraftConfirmed(res.data.data);
        }
        if (onDraftsUpdated) {
          onDraftsUpdated();
        }
      }
    } catch (err) {
      console.error('Failed to confirm draft:', err);
      alert(err.response?.data?.message || 'Failed to confirm draft');
    }
  };

  const handleDismiss = async (draft) => {
    try {
      const res = await api.delete(`/transactions/drafts/${draft._id}`);
      if (res.data?.success) {
        if (onDraftsUpdated) {
          onDraftsUpdated();
        }
      }
    } catch (err) {
      console.error('Failed to dismiss draft:', err);
    }
  };

  const handleStartEdit = (draft) => {
    setEditingDraft(draft);
    setEditForm({
      amount: draft.amount,
      category: draft.category || 'Food & Dining',
      description: draft.description || '',
      date: draft.date ? draft.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingDraft) return;

    setSaving(true);
    try {
      const res = await api.patch(`/transactions/drafts/${editingDraft._id}/approve`, editForm);
      if (res.data?.success) {
        setEditingDraft(null);
        if (onDraftConfirmed) {
          onDraftConfirmed(res.data.data);
        }
        if (onDraftsUpdated) {
          onDraftsUpdated();
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save and confirm draft');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAll = async () => {
    try {
      const res = await api.post('/transactions/drafts/approve-all');
      if (res.data?.success) {
        if (onDraftsUpdated) {
          onDraftsUpdated();
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to confirm all drafts');
    }
  };

  const totalAmount = drafts.reduce((sum, d) => sum + Number(d.amount || 0), 0);

  return (
    <section
      aria-label="Needs review draft transactions"
      className={`review-tray ${className}`}
      style={{ marginBottom: '1.5rem' }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-secondary)',
            }}
          >
            Needs review ({drafts.length})
          </span>
          <span
            className="num-tabular"
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            ₹{totalAmount.toLocaleString('en-IN')} pending
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleConfirmAll}
          style={{
            background: 'var(--color-positive-bg)',
            border: '1px solid var(--color-positive-border)',
            color: 'var(--color-positive)',
            fontSize: '0.76rem',
            fontWeight: 600,
          }}
        >
          ⚡ Confirm All ({drafts.length})
        </Button>
      </div>

      {/* Cards stack with AnimatePresence */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <AnimatePresence mode="popLayout">
          {drafts.map((draft) => (
            <ReviewCard
              key={draft._id}
              draft={draft}
              onConfirm={handleConfirm}
              onEdit={handleStartEdit}
              onDismiss={handleDismiss}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Quick Edit Modal */}
      {editingDraft && (
        <Modal
          isOpen={Boolean(editingDraft)}
          onClose={() => setEditingDraft(null)}
          title="Review & Confirm Expense"
        >
          <form onSubmit={handleSaveEdit} className="form-group">
            <div className="input-field">
              <label>Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                required
                className="input-glass"
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
              />
            </div>

            <div className="input-field">
              <label>Category</label>
              <select
                className="input-glass"
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-field">
              <label>Description / Note</label>
              <input
                type="text"
                className="input-glass"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>

            <div className="input-field">
              <label>Date</label>
              <input
                type="date"
                required
                className="input-glass"
                value={editForm.date}
                onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1rem' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingDraft(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={saving}
                disabled={saving}
              >
                Confirm & Save
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
};

export default ReviewTray;
