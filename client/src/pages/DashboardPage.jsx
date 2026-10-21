import { useState, useEffect } from 'react';
import useFetch from '../hooks/useFetch.js';
import HeroSafeToSpend from '../components/HeroSafeToSpend.jsx';
import BillsAndSubscriptionsCard from '../components/BillsAndSubscriptionsCard.jsx';
import NeedsReviewCard from '../components/NeedsReviewCard.jsx';
import BudgetsAndGoalsCard from '../components/BudgetsAndGoalsCard.jsx';
import TripModeWidget from '../components/TripModeWidget.jsx';
import QuickAddBar from '../components/QuickAddBar.jsx';
import Modal from '../components/Modal.jsx';
import TransactionForm from '../components/TransactionForm.jsx';
import VoiceExpenseRecorder from '../components/VoiceExpenseRecorder.jsx';
import ReceiptScannerBox from '../components/ReceiptScannerBox.jsx';
import Button from '../components/Button.jsx';
import api from '../api/axios.js';

/**
 * Quiet Ledger Dashboard (Home)
 *
 * - Hero: "Safe to spend" with ~104px serif number, daily pacing line, month-progress bar, "+ Add expense" pill.
 * - Two-column grid:
 *   - LEFT: "Bills & subscriptions" (recurring bills, renewals, auto-pay, total due, auto-detected charges)
 *   - RIGHT: "Needs review" (draft transactions with Edit & Confirm), then "Budgets & goals"
 */
const DashboardPage = () => {
  const [refreshCount, setRefreshCount] = useState(0);
  const [quickAddPrefill, setQuickAddPrefill] = useState('');

  // Primary data hooks
  const { data: summary, loading: loadingSummary } = useFetch(
    '/analytics/summary',
    {},
    [refreshCount]
  );
  const { data: budgets, loading: loadingBudgets } = useFetch('/budgets', {}, [refreshCount]);
  const { data: goals, loading: loadingGoals } = useFetch('/goals', {}, [refreshCount]);
  const { data: draftsData } = useFetch(
    '/transactions/drafts',
    {},
    [refreshCount]
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('manual');
  const [saving, setSaving] = useState(false);
  const [magicBanner, setMagicBanner] = useState(null);

  // Check URL query parameters for magic link approval confirmation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('drafts_approved') === 'true') {
      const count = params.get('count') || 'All';
      setMagicBanner(`⚡ Success! ${count} pending expense drafts were approved via your magic link.`);
      window.history.replaceState({}, document.title, window.location.pathname);
      setRefreshCount((c) => c + 1);
      setTimeout(() => setMagicBanner(null), 6000);
    }
  }, []);

  // Edit transaction state
  const [editingTx, setEditingTx] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [recentlyAddedTx, setRecentlyAddedTx] = useState(null);

  const drafts = draftsData || [];

  // Calculate total budget limits
  const totalBudgetLimits = Array.isArray(budgets)
    ? budgets.reduce((sum, b) => sum + (Number(b.limit) || 0), 0)
    : 0;

  const handleTransactionCreated = (newTx) => {
    setRefreshCount((c) => c + 1);
    if (newTx && newTx._id) {
      setRecentlyAddedTx(newTx);
    }
  };

  const handleManualAddSubmit = async (payload) => {
    setSaving(true);
    try {
      const res = await api.post('/transactions', payload);
      if (res.data?.success) {
        handleTransactionCreated(res.data.data);
        setModalOpen(false);
        return res.data;
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (payload) => {
    if (!editingTx) return;
    setSaving(true);
    try {
      const res = await api.put(`/transactions/${editingTx._id}`, payload);
      if (res.data?.success) {
        setRefreshCount((c) => c + 1);
        setRecentlyAddedTx(res.data.data);
        setEditModalOpen(false);
        setEditingTx(null);
        return res.data;
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecentTx = async () => {
    if (!recentlyAddedTx) return;
    if (window.confirm('Delete this transaction?')) {
      try {
        await api.delete(`/transactions/${recentlyAddedTx._id}`);
        setRecentlyAddedTx(null);
        setRefreshCount((c) => c + 1);
      } catch (err) {
        alert(err?.response?.data?.message || 'Failed to delete transaction');
      }
    }
  };

  // QuickAddBar interactions
  const handleQuickAddSubmit = (text) => {
    setQuickAddPrefill(text);
    setModalTab('voice');
    setModalOpen(true);
  };

  const handleQuickAddVoice = () => {
    setQuickAddPrefill('');
    setModalTab('voice');
    setModalOpen(true);
  };

  const handleQuickAddScan = () => {
    setModalTab('receipt');
    setModalOpen(true);
  };

  return (
    <div className="quiet-ledger-dashboard" style={{ maxWidth: '1280px', margin: '0 auto', paddingBottom: '5rem' }}>
      {/* Magic link confirmation banner */}
      {magicBanner && (
        <div
          role="status"
          style={{
            marginBottom: '1.25rem',
            padding: '0.85rem 1.25rem',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 'var(--radius-md, 10px)',
            color: 'var(--color-positive, #10B981)',
            fontSize: '0.9rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{magicBanner}</span>
          <button
            type="button"
            onClick={() => setMagicBanner(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'currentColor',
              cursor: 'pointer',
              fontSize: '1rem',
              opacity: 0.75,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Hero: Safe to Spend */}
      <div style={{ marginBottom: '2rem' }}>
        <HeroSafeToSpend
          income={summary?.totalIncome || 0}
          spent={summary?.totalExpense || 0}
          budgetTotal={totalBudgetLimits}
          loading={loadingSummary}
          onAddExpense={() => {
            setQuickAddPrefill('');
            setModalTab('manual');
            setModalOpen(true);
          }}
        />
      </div>

      {/* Active Trip Mode banner (if user is on an active trip) */}
      <div style={{ marginBottom: '1.5rem' }}>
        <TripModeWidget onTripChanged={() => setRefreshCount((c) => c + 1)} />
      </div>

      {/* 2. Below the hero: Two-column grid (Bills & subscriptions on LEFT, Needs review + Budgets & goals on RIGHT) */}
      <div
        className="dashboard-two-col-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: '1.75rem',
          alignItems: 'start',
        }}
      >
        {/* LEFT / LARGEST CARD: Bills & subscriptions */}
        <div>
          <BillsAndSubscriptionsCard onTransactionLogged={handleTransactionCreated} />
        </div>

        {/* RIGHT / STACKED CARDS: Needs review + Budgets & goals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          <NeedsReviewCard
            drafts={drafts}
            onDraftsUpdated={() => setRefreshCount((c) => c + 1)}
          />

          <BudgetsAndGoalsCard
            budgets={budgets}
            goals={goals}
            loading={loadingBudgets || loadingGoals}
          />
        </div>
      </div>

      {/* Floating Quick Add shortcut bar */}
      <QuickAddBar
        onSubmit={handleQuickAddSubmit}
        onVoiceClick={handleQuickAddVoice}
        onScanClick={handleQuickAddScan}
      />

      {/* Add / Import Transaction Modal */}
      <Modal
        title="Add Expense"
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
      >
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
          }}
        >
          <Button
            type="button"
            variant={modalTab === 'manual' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setModalTab('manual')}
          >
            Manual entry
          </Button>
          <Button
            type="button"
            variant={modalTab === 'voice' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setModalTab('voice')}
          >
            🎙️ Record voice
          </Button>
          <Button
            type="button"
            variant={modalTab === 'receipt' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setModalTab('receipt')}
          >
            🧾 Scan receipt
          </Button>
        </div>

        {modalTab === 'manual' && (
          <TransactionForm
            onSubmit={handleManualAddSubmit}
            submitting={saving}
            onCancel={() => setModalOpen(false)}
          />
        )}

        {modalTab === 'voice' && (
          <VoiceExpenseRecorder
            initialText={quickAddPrefill}
            onCancel={() => setModalOpen(false)}
            onTransactionCreated={(newTx) => {
              handleTransactionCreated(newTx);
              setModalOpen(false);
            }}
          />
        )}

        {modalTab === 'receipt' && (
          <ReceiptScannerBox
            compact
            onTransactionCreated={(newTx) => {
              handleTransactionCreated(newTx);
              setModalOpen(false);
            }}
          />
        )}
      </Modal>

      {/* Post-Add Action Toast: Give instant option to Edit or Delete a wrong transaction */}
      {recentlyAddedTx && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '5.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'var(--color-ink, #14151A)',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: '999px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '0.88rem',
            maxWidth: 'min(580px, 94vw)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ✓ Added ₹{Number(recentlyAddedTx.amount || 0).toLocaleString('en-IN')}{' '}
            <span style={{ opacity: 0.75 }}>
              ({recentlyAddedTx.description || recentlyAddedTx.category})
            </span>
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditingTx(recentlyAddedTx);
                setEditModalOpen(true);
              }}
              style={{
                background: '#FFFFFF',
                color: 'var(--color-ink, #14151A)',
                borderColor: '#FFFFFF',
                fontWeight: 600,
              }}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDeleteRecentTx}
              style={{
                color: '#FCA5A5',
                borderColor: 'rgba(252, 165, 165, 0.4)',
              }}
            >
              Undo / Delete
            </Button>
            <button
              type="button"
              onClick={() => setRecentlyAddedTx(null)}
              aria-label="Dismiss banner"
              title="Dismiss banner"
              className="btn-icon-round"
              style={{
                width: '28px',
                height: '28px',
                minHeight: '28px',
                color: '#9CA3AF',
                borderColor: 'transparent',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      <Modal
        title="Edit Transaction"
        isOpen={editModalOpen}
        onClose={() => !saving && setEditModalOpen(false)}
      >
        {editingTx && (
          <TransactionForm
            initialValues={editingTx}
            onSubmit={handleEditSubmit}
            submitting={saving}
            onCancel={() => {
              setEditModalOpen(false);
              setEditingTx(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
};

export default DashboardPage;
