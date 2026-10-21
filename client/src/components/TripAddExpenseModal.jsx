import { useState, useEffect, useRef } from 'react';
import api from '../api/axios';
import Modal from './Modal';
import Button from './Button';
import useReceiptScan from '../hooks/useReceiptScan';
import { reencodeImageToJpeg } from '../utils/receiptImage';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * One-step "Add expense" for an active trip.
 * Defaults: paid by the host, split equally among everyone. Just type what and how much.
 * Supports:
 * - Pick people (standard equal split)
 * - Ask everyone (Poll mode)
 * - Split by items (Itemized bill review & claims)
 * Supports receipt photo/image attachment with automatic Textract OCR extraction and graceful fallback.
 */
const TripAddExpenseModal = ({ isOpen, onClose, trip, symbol = '₹', onAdded }) => {
  const members = trip?.members || [];
  const [splitMode, setSplitMode] = useState('pick'); // 'pick' | 'poll' | 'items'
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [paidBy, setPaidBy] = useState('');
  const [splitBetween, setSplitBetween] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Receipt attachment & OCR state
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
  const [receiptKey, setReceiptKey] = useState('');
  const [extractedItems, setExtractedItems] = useState([]);
  const [scanSummary, setScanSummary] = useState(null);
  const [scanFailed, setScanFailed] = useState(false);

  // Line items for "Split by items" host review
  const [items, setItems] = useState([]);
  const [tax, setTax] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [tip, setTip] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [unclaimedPolicy, setUnclaimedPolicy] = useState('split_equally');

  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  const {
    scanning,
    uploadProgress,
    scanReceipt,
    reset: resetScan,
  } = useReceiptScan({ tripId: trip?._id });

  const handleRemoveReceipt = () => {
    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
    }
    setReceiptFile(null);
    setReceiptPreviewUrl('');
    setReceiptKey('');
    setExtractedItems([]);
    setItems([]);
    setTax(0);
    setServiceCharge(0);
    setTip(0);
    setDiscount(0);
    setScanSummary(null);
    setScanFailed(false);
    resetScan();
    if (splitMode === 'items') {
      setSplitMode('pick');
    }
  };

  useEffect(() => {
    if (!isOpen) {
      handleRemoveReceipt();
      return;
    }
    const ids = (trip?.members || []).map((m) => m._id);
    setSplitMode('pick');
    setDescription('');
    setAmount('');
    setDate(today());
    setPaidBy(ids[0] || '');
    setSplitBetween(ids);
    setItems([]);
    setTax(0);
    setServiceCharge(0);
    setTip(0);
    setDiscount(0);
    setUnclaimedPolicy('split_equally');
    setError('');
  }, [isOpen, trip?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReceiptSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset native input so the user can re-select the same file if needed
    e.target.value = '';

    setScanFailed(false);
    resetScan();

    try {
      const prepared = await reencodeImageToJpeg(file);
      setReceiptFile(prepared);
      const preview = URL.createObjectURL(prepared);
      setReceiptPreviewUrl(preview);

      const res = await scanReceipt(prepared, { tripId: trip?._id, previewUrl: preview });
      if (res) {
        if (res.receiptKey) {
          setReceiptKey(res.receiptKey);
        }
        if (res.merchant) {
          setDescription((prev) => (prev.trim() ? prev : res.merchant));
        }
        if (res.amount !== undefined && res.amount !== null) {
          setAmount(String(res.amount));
        }
        if (res.date) {
          setDate(res.date);
        }
        if (Array.isArray(res.items) && res.items.length > 0) {
          setExtractedItems(res.items);
          setItems(
            res.items.map((it, idx) => ({
              id: `item_${Date.now()}_${idx}`,
              name: it.name || `Item ${idx + 1}`,
              qty: Math.max(1, Number(it.qty) || 1),
              price: Number(it.price) || 0,
            }))
          );
        }
        setTax(Number(res.tax) || 0);
        setServiceCharge(Number(res.serviceCharge) || 0);
        setTip(Number(res.tip) || 0);
        setDiscount(Number(res.discount) || 0);

        setScanSummary({
          itemsCount: (res.items || []).length,
          tax: res.tax || 0,
          total: res.total !== undefined ? res.total : res.amount || 0,
          mismatch: Boolean(res.mismatch),
        });
      } else {
        setScanFailed(true);
      }
    } catch {
      setScanFailed(true);
    }
  };

  const handleAddManualItems = () => {
    if (items.length === 0) {
      setItems([{ id: `item_${Date.now()}_0`, name: '', qty: 1, price: '' }]);
    }
    setSplitMode('items');
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddItemRow = () => {
    setItems((prev) => [
      ...prev,
      { id: `item_${Date.now()}_${prev.length}`, name: '', qty: 1, price: '' },
    ]);
  };

  const handleRemoveItemRow = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const toggle = (id) =>
    setSplitBetween((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allSelected = members.length > 0 && splitBetween.length === members.length;
  const share = splitBetween.length && Number(amount) > 0 ? Number(amount) / splitBetween.length : 0;

  // Calculation for items review
  const itemsSum = items.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
  const computedTotal = Math.max(
    0,
    itemsSum + Number(tax || 0) + Number(serviceCharge || 0) + Number(tip || 0) - Number(discount || 0)
  );
  const hasDiscrepancy =
    splitMode === 'items' &&
    amount !== '' &&
    Math.abs(computedTotal - Number(amount)) > 0.01;

  const isItemsModeAvailable = extractedItems.length > 0 || items.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) return setError('Add a short description, e.g. "Lunch".');
    if (splitMode !== 'items' && !(Number(amount) > 0)) return setError('Enter a valid amount.');
    setSaving(true);
    setError('');

    try {
      if (splitMode === 'items') {
        if (items.length === 0) {
          setSaving(false);
          return setError('Add at least one line item to split by items.');
        }

        for (let i = 0; i < items.length; i++) {
          if (!items[i].name || !items[i].name.trim()) {
            setSaving(false);
            return setError(`Line item #${i + 1} needs a name.`);
          }
          if (items[i].price === '' || isNaN(Number(items[i].price)) || Number(items[i].price) < 0) {
            setSaving(false);
            return setError(`Line item #${i + 1} has an invalid price.`);
          }
        }

        const effectiveTotal = computedTotal > 0 ? computedTotal : Number(amount);

        const billRes = await api.post(`/splits/groups/${trip._id}/bills`, {
          title: description.trim(),
          paidBy,
          items: items.map((it) => ({
            name: it.name.trim(),
            qty: Math.max(1, Math.round(Number(it.qty) || 1)),
            price: Number(it.price) || 0,
          })),
          tax: Number(tax) || 0,
          serviceCharge: Number(serviceCharge) || 0,
          tip: Number(tip) || 0,
          discount: Number(discount) || 0,
          total: effectiveTotal,
          unclaimedPolicy,
          receiptKey: receiptKey || undefined,
          date: date || today(),
          category: 'Dining',
          syncPersonal: true,
        });

        if (billRes.data?.data) {
          if (onAdded) onAdded(billRes.data.data);
          onClose();
        }
      } else if (splitMode === 'poll') {
        const draftRes = await api.post(`/splits/groups/${trip._id}/upi-drafts`, {
          amount: Number(amount),
          merchant: description.trim(),
          category: 'Shared',
          date: date || today(),
          receiptKey: receiptKey || undefined,
        });
        if (draftRes.data?.data?._id) {
          await api.post(`/splits/groups/${trip._id}/upi-drafts/${draftRes.data.data._id}/assign`, {
            mode: 'poll',
            paidBy,
            question: `Did you share the expense of ${symbol}${amount} for ${description.trim()}?`,
          });
        }
        if (onAdded) onAdded(draftRes.data?.data);
        onClose();
      } else {
        if (!splitBetween.length) return setError('Pick at least one person to split with.');
        const res = await api.post(`/splits/groups/${trip._id}/expenses`, {
          description: description.trim(),
          amount: Number(amount),
          paidBy,
          splitBetween,
          date: date || today(),
          category: 'Shared',
          syncPersonal: true,
          receiptKey: receiptKey || undefined,
        });
        if (res.data?.success) {
          if (onAdded) onAdded(res.data.data);
          onClose();
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add the expense.');
    } finally {
      setSaving(false);
    }
  };

  const field = { display: 'flex', flexDirection: 'column', gap: '6px' };
  const label = { fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' };

  return (
    <Modal title="Add trip expense" isOpen={isOpen} onClose={() => !saving && onClose()}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Segmented Control: Pick people vs Ask everyone vs By items */}
        <div
          style={{
            display: 'flex',
            borderRadius: 'var(--radius-md, 8px)',
            overflow: 'hidden',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-surface-elevated, rgba(255,255,255,0.03))',
          }}
        >
          <button
            type="button"
            onClick={() => setSplitMode('pick')}
            style={{
              flex: 1,
              padding: '7px 8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: 'none',
              background: splitMode === 'pick' ? 'var(--accent-primary, #6366F1)' : 'transparent',
              color: splitMode === 'pick' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            👥 Pick people
          </button>
          <button
            type="button"
            onClick={() => setSplitMode('poll')}
            style={{
              flex: 1,
              padding: '7px 8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: 'none',
              background: splitMode === 'poll' ? 'var(--accent-primary, #6366F1)' : 'transparent',
              color: splitMode === 'poll' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            📊 Ask everyone (Poll)
          </button>
          <button
            type="button"
            onClick={() => setSplitMode('items')}
            disabled={!isItemsModeAvailable}
            title={
              isItemsModeAvailable
                ? 'Split items individually'
                : 'Attach a receipt with items to split by item'
            }
            style={{
              flex: 1,
              padding: '7px 8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: 'none',
              background: splitMode === 'items' ? 'var(--accent-primary, #6366F1)' : 'transparent',
              color:
                splitMode === 'items'
                  ? '#fff'
                  : !isItemsModeAvailable
                  ? 'var(--text-muted, #64748b)'
                  : 'var(--text-secondary)',
              cursor: !isItemsModeAvailable ? 'not-allowed' : 'pointer',
              opacity: !isItemsModeAvailable ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            🧾 By items
          </button>
        </div>

        {/* Add receipt row (top of modal above "What was it for?") */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={label}>Receipt</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
              Receipt available for 30 days
            </span>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleReceiptSelect}
            aria-label="Take photo of receipt"
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={handleReceiptSelect}
            aria-label="Upload receipt image"
          />

          {!receiptFile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => cameraInputRef.current?.click()}
                aria-label="Take photo"
              >
                📷 Take photo
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => uploadInputRef.current?.click()}
                aria-label="Upload image"
              >
                📁 Upload image
              </Button>
              {items.length === 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddManualItems}
                  aria-label="Add items manually"
                >
                  + Add items manually
                </Button>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md, 8px)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface-elevated, rgba(255,255,255,0.03))',
              }}
            >
              <img
                src={receiptPreviewUrl}
                alt="Receipt thumbnail"
                style={{
                  width: 44,
                  height: 44,
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--border-color)',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {receiptFile.name}
                </div>
                {scanning ? (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--accent-primary, #6366F1)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>Scanning…</span>
                    {uploadProgress > 0 && <span>({uploadProgress}%)</span>}
                  </div>
                ) : scanFailed ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', lineHeight: 1.25 }}>
                    Couldn't read the receipt. You can still attach it and enter the amount yourself.
                  </div>
                ) : scanSummary ? (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>
                      {scanSummary.itemsCount} items found · tax {symbol}
                      {scanSummary.tax} · total {symbol}
                      {scanSummary.total}
                    </span>
                    {scanSummary.mismatch && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: 'var(--color-warning, #f59e0b)',
                          background: 'rgba(245, 158, 11, 0.1)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        ⚠️ Check totals
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveReceipt}
                aria-label="Remove receipt"
              >
                Remove
              </Button>
            </div>
          )}
        </div>

        <div style={field}>
          <label htmlFor="trip-exp-desc" style={label}>
            What was it for?
          </label>
          <input
            id="trip-exp-desc"
            className="form-input"
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Lunch"
          />
        </div>

        <div style={field}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label htmlFor="trip-exp-amt" style={label}>
              Amount ({symbol})
            </label>
            {splitMode === 'items' && hasDiscrepancy && (
              <button
                type="button"
                onClick={() => setAmount(String(computedTotal))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-primary, #6366F1)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Match items total ({symbol}{computedTotal})
              </button>
            )}
          </div>
          <input
            id="trip-exp-amt"
            className="form-input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="600"
          />
        </div>

        <div style={field}>
          <label htmlFor="trip-exp-date" style={label}>
            Date
          </label>
          <input
            id="trip-exp-date"
            className="form-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div style={field}>
          <label htmlFor="trip-exp-paid" style={label}>
            Paid by
          </label>
          <select id="trip-exp-paid" className="form-input" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {members.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Pick People Mode */}
        {splitMode === 'pick' && (
          <div style={field}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={label}>Split between</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSplitBetween(allSelected ? [] : members.map((m) => m._id))}
              >
                {allSelected ? 'Clear' : 'Select all'}
              </Button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {members.map((m) => {
                const on = splitBetween.includes(m._id);
                return (
                  <Button
                    key={m._id}
                    type="button"
                    size="sm"
                    variant={on ? 'primary' : 'secondary'}
                    aria-pressed={on}
                    onClick={() => toggle(m._id)}
                  >
                    {on ? '✓ ' : ''}
                    {m.name}
                  </Button>
                );
              })}
            </div>
            {share > 0 && (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {symbol}
                {share.toLocaleString(undefined, { maximumFractionDigits: 2 })} each, split equally
              </span>
            )}
          </div>
        )}

        {/* Poll Mode */}
        {splitMode === 'poll' && (
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary, #6366F1)' }}>
              📊 Opt-in Poll Mode
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Everyone in the group will be polled: <strong>"I was part of this"</strong> or <strong>"Not me"</strong>.
              The total will be split down to the exact integer paise among members who join.
            </div>
          </div>
        )}

        {/* Split by Items Host Review Step */}
        {splitMode === 'items' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '1rem',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'var(--bg-surface-elevated, rgba(255,255,255,0.02))',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  🧾 Host Review: Line items ({items.length})
                </span>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Review & edit items before publishing to group members for claiming.
                </div>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={handleAddItemRow}>
                + Add item
              </Button>
            </div>

            {/* Editable item rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {items.map((it, idx) => (
                <div
                  key={it.id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <input
                    className="form-input"
                    style={{ flex: 1, fontSize: '0.82rem', padding: '6px 8px' }}
                    placeholder="Item name"
                    value={it.name}
                    onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                    aria-label={`Item ${idx + 1} name`}
                  />
                  <input
                    className="form-input"
                    style={{ width: '56px', fontSize: '0.82rem', padding: '6px 6px', textAlign: 'center' }}
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Qty"
                    value={it.qty}
                    onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                    aria-label={`Item ${idx + 1} quantity`}
                  />
                  <input
                    className="form-input"
                    style={{ width: '85px', fontSize: '0.82rem', padding: '6px 8px', textAlign: 'right' }}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Price"
                    value={it.price}
                    onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                    aria-label={`Item ${idx + 1} price`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    style={{ padding: '4px 8px' }}
                    onClick={() => handleRemoveItemRow(idx)}
                    aria-label={`Remove item ${idx + 1}`}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>

            {/* Charges and Discounts row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                paddingTop: '8px',
                borderTop: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label htmlFor="bill-tax-input" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Tax ({symbol})</label>
                <input
                  id="bill-tax-input"
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  style={{ fontSize: '0.8rem', padding: '4px 6px' }}
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label htmlFor="bill-service-input" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Service ({symbol})</label>
                <input
                  id="bill-service-input"
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  style={{ fontSize: '0.8rem', padding: '4px 6px' }}
                  value={serviceCharge}
                  onChange={(e) => setServiceCharge(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label htmlFor="bill-tip-input" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Tip ({symbol})</label>
                <input
                  id="bill-tip-input"
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  style={{ fontSize: '0.8rem', padding: '4px 6px' }}
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label htmlFor="bill-discount-input" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Discount ({symbol})</label>
                <input
                  id="bill-discount-input"
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  style={{ fontSize: '0.8rem', padding: '4px 6px' }}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
            </div>

            {/* Live Check Warning / Status */}
            <div
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                background: hasDiscrepancy ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                border: `1px solid ${hasDiscrepancy ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '6px',
                fontSize: '0.76rem',
              }}
            >
              <span
                style={{
                  color: hasDiscrepancy ? 'var(--color-warning, #f59e0b)' : 'var(--accent-success, #10B981)',
                  fontWeight: 600,
                }}
              >
                {hasDiscrepancy
                  ? `⚠️ Items + charges (${symbol}${computedTotal.toFixed(2)}) ≠ Entered total (${symbol}${Number(amount || 0).toFixed(2)})`
                  : `✓ Totals match perfectly (${symbol}${computedTotal.toFixed(2)})`}
              </span>
              {hasDiscrepancy && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setAmount(String(computedTotal))}
                >
                  Match total ({symbol}{computedTotal})
                </Button>
              )}
            </div>

            {/* Unclaimed policy */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="unclaimed-policy" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                If items remain unclaimed after deadline:
              </label>
              <select
                id="unclaimed-policy"
                className="form-input"
                style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                value={unclaimedPolicy}
                onChange={(e) => setUnclaimedPolicy(e.target.value)}
              >
                <option value="split_equally">Split unclaimed items equally among everyone</option>
                <option value="host_absorbs">Host absorbs unclaimed items</option>
              </select>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" style={{ fontSize: '0.85rem', color: 'var(--color-warning)' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {splitMode === 'poll'
              ? 'Start Poll'
              : splitMode === 'items'
              ? 'Publish bill for claiming'
              : 'Add expense'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default TripAddExpenseModal;
