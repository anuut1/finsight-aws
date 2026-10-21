import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import Button from './Button.jsx';

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

const UnconfirmedDraftsDrawer = ({ onDraftsUpdated }) => {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [notificationPreview, setNotificationPreview] = useState(null);
  const [magicBanner, setMagicBanner] = useState(null);

  // Check URL query parameters for magic link approval confirmation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('drafts_approved') === 'true') {
      const count = params.get('count') || 'All';
      setMagicBanner(`⚡ Success! ${count} pending expense drafts were approved via your magic link.`);
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => setMagicBanner(null), 6000);
    }
  }, []);

  const fetchDrafts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/transactions/drafts');
      if (res.data?.success) {
        setDrafts(res.data.data || []);
      }
    } catch (err) {
      console.warn('Could not fetch drafts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const totalAmount = drafts.reduce((sum, d) => sum + Number(d.amount || 0), 0);

  const handleApproveAll = async () => {
    if (!drafts.length) return;
    setActionLoading(true);
    try {
      const res = await api.post('/transactions/drafts/approve-all');
      if (res.data?.success) {
        setDrafts([]);
        if (onDraftsUpdated) onDraftsUpdated();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve all drafts');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveSingle = async (draftId) => {
    setActionLoading(true);
    try {
      const payload = editingId === draftId ? editForm : {};
      const res = await api.patch(`/transactions/drafts/${draftId}/approve`, payload);
      if (res.data?.success) {
        setDrafts((prev) => prev.filter((d) => d._id !== draftId));
        setEditingId(null);
        if (onDraftsUpdated) onDraftsUpdated();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve draft');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSingle = async (draftId) => {
    if (!window.confirm('Are you sure you want to dismiss this draft expense?')) return;
    setActionLoading(true);
    try {
      const res = await api.delete(`/transactions/drafts/${draftId}`);
      if (res.data?.success) {
        setDrafts((prev) => prev.filter((d) => d._id !== draftId));
        setEditingId(null);
        if (onDraftsUpdated) onDraftsUpdated();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to dismiss draft');
    } finally {
      setActionLoading(false);
    }
  };

  const startEditing = (draft) => {
    setEditingId(draft._id);
    setEditForm({
      amount: draft.amount,
      category: draft.category,
      description: draft.description,
      date: draft.date ? draft.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
  };

  const handleTriggerEodDigest = async () => {
    setActionLoading(true);
    try {
      const res = await api.post('/transactions/drafts/eod-trigger');
      if (res.data?.success && res.data.data?.notification) {
        setNotificationPreview(res.data.data.notification);
      } else {
        alert(res.data?.data?.message || 'EOD reminder triggered successfully.');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to trigger EOD reminder');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      {/* Magic link confirmation banner */}
      {magicBanner && (
        <div
          style={{
            marginBottom: '16px',
            padding: '14px 20px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.1))',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '12px',
            color: '#10B981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <span>{magicBanner}</span>
          <button
            type="button"
            className="btn-icon-round"
            onClick={() => setMagicBanner(null)}
            aria-label="Dismiss banner"
            title="Dismiss"
            style={{
              width: '28px',
              height: '28px',
              color: '#10B981',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Banner on Dashboard when drafts exist */}
      {drafts.length > 0 && (
        <div
          style={{
            marginBottom: '24px',
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.08))',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '14px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                fontSize: '22px',
                background: 'rgba(99, 102, 241, 0.25)',
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              🔔
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px', color: '#F8FAFC' }}>
                You have {drafts.length} unconfirmed {drafts.length === 1 ? 'expense' : 'expenses'}{' '}
                waiting for review
              </div>
              <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '2px' }}>
                Total pending approval:{' '}
                <strong style={{ color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                  ₹{totalAmount.toLocaleString('en-IN')}
                </strong>
                . Automatic End-of-Day digest runs via AWS EventBridge at 9:00 PM.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleApproveAll}
              disabled={actionLoading}
              loading={actionLoading}
            >
              ⚡ Approve All ({drafts.length})
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsOpen(true)}
            >
              Review Drafts &rarr;
            </Button>
          </div>
        </div>
      )}

      {/* Review & End-of-Day Modal Drawer */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div
            style={{
              background: '#0F172A',
              border: '1px solid #1E293B',
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #1E293B',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0B1020',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#F8FAFC' }}>
                  Unconfirmed Expense Drafts ({drafts.length})
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94A3B8' }}>
                  Review drafts captured from Voice, Bank Alerts, or Receipt OCR before they impact your budgets.
                </p>
              </div>
              <button
                type="button"
                className="btn-icon-round"
                onClick={() => setIsOpen(false)}
                aria-label="Close drafts modal"
                title="Close"
                style={{
                  width: '32px',
                  height: '32px',
                  color: '#94A3B8',
                  fontSize: '18px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div
              style={{
                padding: '12px 24px',
                background: '#1E293B',
                borderBottom: '1px solid #334155',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div style={{ fontSize: '14px', color: '#E2E8F0' }}>
                Pending:{' '}
                <strong style={{ color: '#F43F5E', fontVariantNumeric: 'tabular-nums' }}>
                  ₹{totalAmount.toLocaleString('en-IN')}
                </strong>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleTriggerEodDigest}
                  disabled={actionLoading || drafts.length === 0}
                  loading={actionLoading}
                  title="Simulate EventBridge -> Lambda execution and view SES digest preview"
                >
                  ✉️ Test EOD Digest
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleApproveAll}
                  disabled={actionLoading || drafts.length === 0}
                  loading={actionLoading}
                >
                  ⚡ Approve All ({drafts.length})
                </Button>
              </div>
            </div>

            {/* Notification preview if triggered */}
            {notificationPreview && (
              <div
                style={{
                  margin: '16px 24px',
                  padding: '16px',
                  background: 'rgba(99, 102, 241, 0.1)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: '10px',
                  fontSize: '13px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <strong style={{ color: '#A5B4FC' }}>
                    {notificationPreview.sesSent
                      ? '✅ AWS SES Email Dispatched!'
                      : '📧 EOD Reminder Digest Generated (Preview Mode)'}
                  </strong>
                  <button
                    type="button"
                    className="btn-icon-round"
                    onClick={() => setNotificationPreview(null)}
                    aria-label="Close notification preview"
                    title="Close"
                    style={{
                      width: '24px',
                      height: '24px',
                      color: '#94A3B8',
                    }}
                  >
                    ✕
                  </button>
                </div>
                <p style={{ margin: '0 0 10px 0', color: '#94A3B8' }}>
                  Scheduled EventBridge Lambda payload prepared. One-tap magic link created:
                </p>
                <div
                  style={{
                    background: '#0B1020',
                    padding: '10px',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    wordBreak: 'break-all',
                    color: '#10B981',
                  }}
                >
                  <a
                    href={notificationPreview.magicApproveUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#38BDF8', textDecoration: 'underline' }}
                  >
                    Click to test One-Tap Magic Link &rarr;
                  </a>
                </div>
              </div>
            )}

            {/* Drafts List */}
            <div
              style={{
                padding: '16px 24px',
                overflowY: 'auto',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {loading ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#94A3B8' }}>
                  Loading drafts...
                </div>
              ) : drafts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#F8FAFC' }}>
                    All caught up!
                  </div>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>
                    No unconfirmed drafts pending. When you save an expense as a draft from Quick Add, Bank Alerts, or Receipt OCR, it will appear here.
                  </div>
                </div>
              ) : (
                drafts.map((d) => (
                  <div
                    key={d._id}
                    style={{
                      background: '#1E293B',
                      border: '1px solid #334155',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    {editingId === d._id ? (
                      // Inline edit mode
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="number"
                            value={editForm.amount}
                            onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                            placeholder="Amount"
                            style={{
                              flex: 1,
                              background: '#0F172A',
                              border: '1px solid #475569',
                              color: '#F8FAFC',
                              padding: '6px 10px',
                              borderRadius: '6px',
                            }}
                          />
                          <select
                            value={editForm.category}
                            onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                            style={{
                              flex: 1,
                              background: '#0F172A',
                              border: '1px solid #475569',
                              color: '#F8FAFC',
                              padding: '6px 10px',
                              borderRadius: '6px',
                            }}
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          placeholder="Description / Merchant"
                          style={{
                            background: '#0F172A',
                            border: '1px solid #475569',
                            color: '#F8FAFC',
                            padding: '6px 10px',
                            borderRadius: '6px',
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => handleApproveSingle(d._id)}
                            disabled={actionLoading}
                            loading={actionLoading}
                          >
                            Save & Approve
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Read-only draft row
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              background: '#0F172A',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '16px',
                            }}
                          >
                            🧾
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 600, color: '#F8FAFC', fontSize: '15px' }}>
                                {d.description || 'Unspecified Expense'}
                              </span>
                              <span
                                style={{
                                  background: '#334155',
                                  color: '#A5B4FC',
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '9999px',
                                }}
                              >
                                {d.category}
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                              {new Date(d.date).toLocaleDateString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                              })}{' '}
                              &bull; {d.source ? `Source: ${d.source}` : 'Draft'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div
                            style={{
                              fontSize: '16px',
                              fontWeight: 700,
                              color: '#F43F5E',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            ₹{Number(d.amount).toLocaleString('en-IN')}
                          </div>

                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn-icon-round"
                              onClick={() => startEditing(d)}
                              aria-label={`Edit ${d.description || 'draft'}`}
                              title="Edit draft details"
                              style={{
                                width: '32px',
                                height: '32px',
                                fontSize: '12px',
                                color: '#94A3B8',
                              }}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="btn-icon-round"
                              onClick={() => handleRejectSingle(d._id)}
                              aria-label={`Dismiss ${d.description || 'draft'}`}
                              title="Dismiss / delete draft"
                              style={{
                                width: '32px',
                                height: '32px',
                                fontSize: '12px',
                                color: '#F43F5E',
                              }}
                            >
                              🗑️
                            </button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleApproveSingle(d._id)}
                              disabled={actionLoading}
                              style={{
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#10B981',
                                fontSize: '12px',
                                fontWeight: 600,
                              }}
                            >
                              ✓ Approve
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UnconfirmedDraftsDrawer;
