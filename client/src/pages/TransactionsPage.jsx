import { useEffect, useState } from 'react';
import Card from '../components/Card.jsx';
import Modal from '../components/Modal.jsx';
import TransactionForm from '../components/TransactionForm.jsx';
import VoiceExpenseRecorder from '../components/VoiceExpenseRecorder.jsx';
import ReceiptScannerModal from '../components/ReceiptScannerModal.jsx';
import UnconfirmedDraftsDrawer from '../components/UnconfirmedDraftsDrawer.jsx';
import Button from '../components/Button.jsx';
import api from '../api/axios.js';

const TransactionsPage = () => {
  const [filters, setFilters] = useState({
    type: '',
    category: '',
    startDate: '',
    endDate: '',
  });
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [data, setData] = useState({ items: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('manual');
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recentlyAddedTx, setRecentlyAddedTx] = useState(null);

  useEffect(() => {
    if (recentlyAddedTx) {
      const timer = setTimeout(() => {
        setRecentlyAddedTx(null);
      }, 12000);
      return () => clearTimeout(timer);
    }
  }, [recentlyAddedTx]);

  const fetchTransactions = async (activeFilters = filters, activePage = page) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', activePage);
      params.set('limit', limit);
      if (activeFilters.type) params.set('type', activeFilters.type);
      if (activeFilters.category) params.set('category', activeFilters.category);
      if (activeFilters.startDate) params.set('startDate', activeFilters.startDate);
      if (activeFilters.endDate) params.set('endDate', activeFilters.endDate);

      const res = await api.get(`/transactions?${params.toString()}`);
      if (res.data?.success) {
        setData(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  // Debounced search on filters change
  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      fetchTransactions(filters, 1);
    }, 350);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    fetchTransactions(filters, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const applyFilters = () => {
    setPage(1);
    fetchTransactions(filters, 1);
  };

  const handleClearFilters = () => {
    const reset = { type: '', category: '', startDate: '', endDate: '' };
    setFilters(reset);
    setPage(1);
    fetchTransactions(reset, 1);
  };

  const handleChangeFilter = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const openNewModal = (tab = 'manual') => {
    setEditing(null);
    setModalTab(tab);
    setModalOpen(true);
  };

  const openEditModal = (tx) => {
    setEditing(tx);
    setModalTab('manual');
    setModalOpen(true);
  };

  const handleSave = async (payload) => {
    setSaving(true);
    try {
      if (editing) {
        const res = await api.put(`/transactions/${editing._id}`, payload);
        if (res.data?.success) {
          setData((prev) => ({
            ...prev,
            items: prev.items.map((t) => (t._id === editing._id ? res.data.data : t)),
          }));
          setRecentlyAddedTx(res.data.data);
          setModalOpen(false);
          return res.data;
        }
      } else {
        const res = await api.post('/transactions', payload);
        if (res.data?.success) {
          setData((prev) => ({
            ...prev,
            items: [res.data.data, ...prev.items].slice(0, limit),
          }));
          setRecentlyAddedTx(res.data.data);
          setModalOpen(false);
          return res.data;
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      const res = await api.delete(`/transactions/${id}`);
      if (res.data?.success) {
        setData((prev) => ({
          ...prev,
          items: prev.items.filter((t) => t._id !== id),
        }));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete transaction');
    }
  };

  const items = data.items || [];
  const pagination = data.pagination || { page: 1, pages: 1 };

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
          <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 700 }}>Transactions</h1>
          <p className="text-muted" style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
            Search, filter, and manage every income and expense line.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setReceiptModalOpen(true)}
          >
            🧾 Scan receipt
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => openNewModal('voice')}
          >
            🎙️ Record voice
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => openNewModal('manual')}
          >
            + Add transaction
          </Button>
        </div>
      </div>

      <UnconfirmedDraftsDrawer onDraftsUpdated={fetchTransactions} />

      <Card style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            name="type"
            value={filters.type}
            onChange={handleChangeFilter}
            className="input-glass"
            style={{ flex: '1 1 120px' }}
          >
            <option value="">All types</option>
            <option value="income">Income (+)</option>
            <option value="expense">Expense (−)</option>
          </select>
          <input
            name="category"
            value={filters.category}
            onChange={handleChangeFilter}
            className="input-glass"
            placeholder="Category"
            style={{ flex: '1 1 150px' }}
          />
          <input
            type="date"
            name="startDate"
            value={filters.startDate}
            onChange={handleChangeFilter}
            className="input-glass"
            style={{ flex: '1 1 140px' }}
            aria-label="Start date"
          />
          <input
            type="date"
            name="endDate"
            value={filters.endDate}
            onChange={handleChangeFilter}
            className="input-glass"
            style={{ flex: '1 1 140px' }}
            aria-label="End date"
          />
          <Button
            type="button"
            variant="primary"
            onClick={applyFilters}
          >
            Filter
          </Button>
          {(filters.type || filters.category || filters.startDate || filters.endDate) && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleClearFilters}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      <Card style={{ padding: '1.25rem 1.4rem' }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.86rem',
            }}
          >
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', paddingBottom: '0.65rem' }}>Date</th>
                <th style={{ textAlign: 'left', paddingBottom: '0.65rem' }}>Description</th>
                <th style={{ textAlign: 'left', paddingBottom: '0.65rem' }}>Category</th>
                <th style={{ textAlign: 'right', paddingBottom: '0.65rem' }}>Amount</th>
                <th style={{ textAlign: 'left', paddingBottom: '0.65rem', paddingLeft: '1rem' }}>Mood</th>
                <th style={{ textAlign: 'right', paddingBottom: '0.65rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="6" style={{ padding: '1.25rem 0', textAlign: 'center' }} className="text-muted">
                    Loading transactions...
                  </td>
                </tr>
              )}
              {error && !loading && (
                <tr>
                  <td colSpan="6" style={{ padding: '1.25rem 0', textAlign: 'center', color: 'var(--color-negative)' }}>
                    {error}
                  </td>
                </tr>
              )}
              {!loading && !error && items.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ padding: '1.5rem 0', textAlign: 'center' }} className="text-muted">
                    No transactions found.
                  </td>
                </tr>
              )}
              {items.map((t) => {
                const isIncome = t.type === 'income';
                return (
                  <tr
                    key={t._id}
                    style={{
                      borderBottom: '1px solid var(--divider-color)',
                      transition: 'background var(--transition-fast)',
                    }}
                  >
                    <td style={{ padding: '0.65rem 0', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {new Date(t.date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.65rem 0', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {t.description || '—'}
                    </td>
                    <td style={{ padding: '0.65rem 0' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm, 8px)',
                          background: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {t.category}
                      </span>
                    </td>
                    <td
                      className="num-tabular"
                      style={{
                        padding: '0.65rem 0',
                        textAlign: 'right',
                        fontWeight: 700,
                        fontSize: '0.92rem',
                        color: isIncome ? 'var(--color-positive)' : 'var(--color-negative)',
                      }}
                    >
                      {isIncome ? '+ ₹' : '− ₹'}{Number(t.amount || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '0.65rem 0', paddingLeft: '1rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          background:
                            t.mood === 'happy'
                              ? 'var(--color-positive-bg)'
                              : t.mood === 'stressed'
                              ? 'var(--color-negative-bg)'
                              : 'var(--bg-surface-elevated)',
                          color:
                            t.mood === 'happy'
                              ? 'var(--color-positive)'
                              : t.mood === 'stressed'
                              ? 'var(--color-negative)'
                              : 'var(--text-muted)',
                          border: `1px solid ${
                            t.mood === 'happy'
                              ? 'var(--color-positive-border)'
                              : t.mood === 'stressed'
                              ? 'var(--color-negative-border)'
                              : 'var(--border-color)'
                          }`,
                        }}
                      >
                        {t.mood ? t.mood.charAt(0).toUpperCase() + t.mood.slice(1) : 'Neutral'}
                      </span>
                    </td>
                    <td style={{ padding: '0.65rem 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => openEditModal(t)}
                        style={{ marginRight: '0.4rem' }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(t._id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.8rem',
          }}
        >
          <span className="text-muted num-tabular">
            Page {pagination.page} of {pagination.pages || 1}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pagination.page >= (pagination.pages || 1)}
              onClick={() =>
                setPage((p) => (pagination.pages ? Math.min(pagination.pages, p + 1) : p + 1))
              }
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        title={editing ? 'Edit transaction' : 'Add transaction'}
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
      >
        {!editing && (
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
          </div>
        )}

        {(editing || modalTab === 'manual') && (
          <TransactionForm
            initialValues={editing}
            onSubmit={handleSave}
            submitting={saving}
            onCancel={() => setModalOpen(false)}
          />
        )}

        {!editing && modalTab === 'voice' && (
          <VoiceExpenseRecorder
            onCancel={() => setModalOpen(false)}
            onTransactionCreated={(newTx) => {
              fetchTransactions();
              if (newTx && newTx._id) {
                setRecentlyAddedTx(newTx);
              }
              setModalOpen(false);
            }}
          />
        )}
      </Modal>

      <ReceiptScannerModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        onTransactionCreated={(newTx) => {
          fetchTransactions();
          if (newTx && newTx._id) {
            setRecentlyAddedTx(newTx);
          }
        }}
      />

      {/* Post-Add Action Toast: Give instant option to Edit or Delete a wrong transaction */}
      {recentlyAddedTx && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '2rem',
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
              onClick={() => openEditModal(recentlyAddedTx)}
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
              onClick={async () => {
                await handleDelete(recentlyAddedTx._id);
                setRecentlyAddedTx(null);
              }}
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
    </>
  );
};

export default TransactionsPage;

