import { useState } from 'react';
import Card from './Card.jsx';
import Button from './Button.jsx';
import Modal from './Modal.jsx';
import Input from './Input.jsx';
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
 * Quiet Ledger "Needs review" Card
 *
 * Shows unconfirmed draft transactions with Edit and Confirm buttons.
 */
const NeedsReviewCard = ({ drafts = [], onDraftsUpdated, className = '', style = {} }) => {
  const [editingDraft, setEditingDraft] = useState(null);
  const [editForm, setEditForm] = useState({ amount: '', category: '', description: '', date: '' });
  const [submitting, setSubmitting] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);

  const handleConfirm = async (draft) => {
    setConfirmingId(draft._id);
    try {
      const res = await api.patch(`/transactions/drafts/${draft._id}/approve`, {});
      if (res.data?.success) {
        if (onDraftsUpdated) onDraftsUpdated();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to confirm transaction');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleOpenEdit = (draft) => {
    setEditingDraft(draft);
    setEditForm({
      amount: String(draft.amount || ''),
      category: draft.category || 'Food & Dining',
      description: draft.description || '',
      date: draft.date ? draft.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingDraft) return;

    setSubmitting(true);
    try {
      const res = await api.patch(`/transactions/drafts/${editingDraft._id}/approve`, {
        amount: Number(editForm.amount),
        category: editForm.category,
        description: editForm.description,
        date: editForm.date,
      });
      if (res.data?.success) {
        setEditingDraft(null);
        if (onDraftsUpdated) onDraftsUpdated();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save and confirm');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = async (id) => {
    if (!window.confirm('Dismiss this draft?')) return;
    try {
      const res = await api.delete(`/transactions/drafts/${id}`);
      if (res.data?.success) {
        if (onDraftsUpdated) onDraftsUpdated();
      }
    } catch (err) {
      console.error('Failed to dismiss draft:', err);
    }
  };

  return (
    <Card style={{ padding: '1.75rem', ...style }} className={`needs-review-card ${className}`}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '1rem',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-heading, "Instrument Serif", serif)',
            fontSize: '1.4rem',
            margin: 0,
            fontWeight: 400,
            letterSpacing: '-0.01em',
          }}
        >
          Needs review
        </h3>
        {drafts.length > 0 && (
          <span
            style={{
              fontSize: '0.78rem',
              color: 'var(--color-warning)',
              fontWeight: 500,
            }}
          >
            {drafts.length} pending
          </span>
        )}
      </div>

      {drafts.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          All transactions reviewed. You're up to date.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {drafts.slice(0, 4).map((draft) => {
            const isConfirming = confirmingId === draft._id;

            return (
              <div
                key={draft._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 0.85rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-input, 14px)',
                  background: 'var(--bg-surface)',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '120px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    {draft.description || 'Draft expense'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {draft.category || 'Uncategorized'} •{' '}
                    {new Date(draft.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    className="num-tabular"
                    style={{
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      color: 'var(--text-primary)',
                      fontVariantNumeric: 'tabular-nums',
                      marginRight: '4px',
                    }}
                  >
                    ₹{Number(draft.amount || 0).toLocaleString('en-IN')}
                  </span>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenEdit(draft)}
                    style={{ padding: '0 10px', height: '32px', fontSize: '0.78rem' }}
                    aria-label={`Edit ${draft.description}`}
                  >
                    Edit
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleConfirm(draft)}
                    loading={isConfirming}
                    disabled={isConfirming}
                    style={{ padding: '0 12px', height: '32px', fontSize: '0.78rem' }}
                    aria-label={`Confirm ${draft.description}`}
                  >
                    Confirm
                  </Button>

                  <button
                    type="button"
                    className="btn-icon-round"
                    onClick={() => handleDismiss(draft._id)}
                    aria-label="Dismiss draft"
                    title="Dismiss"
                    style={{
                      width: '32px',
                      height: '32px',
                      fontSize: '0.82rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Draft Modal */}
      <Modal
        title="Edit & Confirm Transaction"
        isOpen={Boolean(editingDraft)}
        onClose={() => setEditingDraft(null)}
      >
        {editingDraft && (
          <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Input
              label="Description"
              id="edit-draft-desc"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              required
            />

            <Input
              label="Amount (₹)"
              id="edit-draft-amount"
              type="number"
              value={editForm.amount}
              onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
              required
            />

            <div className="input-field">
              <label htmlFor="edit-draft-cat">Category</label>
              <select
                id="edit-draft-cat"
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                className="form-input"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <Input
              label="Date"
              id="edit-draft-date"
              type="date"
              value={editForm.date}
              onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
              required
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setEditingDraft(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={submitting}>
                Save & Confirm
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
};

export default NeedsReviewCard;
