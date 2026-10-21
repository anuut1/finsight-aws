import { useState, useRef } from 'react';
import api from '../api/axios';
import Button from './Button.jsx';
import { reencodeImageToJpeg } from '../utils/receiptImage';
import useReceiptScan from '../hooks/useReceiptScan';

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
  'Other',
];

const ReceiptScannerBox = ({ onTransactionCreated, compact = false, tripId = null }) => {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const {
    status: scanStatus,
    scanning,
    uploadProgress,
    error: scanError,
    scanReceipt,
    reset: resetScan,
  } = useReceiptScan({ tripId });
  const [localError, setLocalError] = useState('');
  const error = localError || scanError;
  const setError = (msg) => setLocalError(msg);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [scanMode, setScanMode] = useState('auto'); // 'auto' (S3 pipeline with fallback) | 'direct' (direct multipart sync)
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setLocalError('');
    resetScan();

    // Pre-check file size cap
    if (selected.size > 15 * 1024 * 1024) {
      setError('File size must be under 15MB. Please choose a smaller file.');
      return;
    }

    try {
      // Re-encode image to JPEG (max 2000px, 0.85 quality) to ensure AWS Textract compatibility
      const processedFile = await reencodeImageToJpeg(selected);

      if (processedFile.size > 10 * 1024 * 1024) {
        setError('Processed file exceeds the 10MB limit for AWS Textract. Please take a closer photo.');
        return;
      }

      setFile(processedFile);
      const url = URL.createObjectURL(processedFile);
      setPreviewUrl(url);
      setDraft(null);
      setSuccess(false);
    } catch (procErr) {
      setError(procErr.message || "Couldn't read this receipt, try a clearer photo or enter it manually");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      const syntheticEvent = { target: { files: [droppedFile] } };
      handleFileChange(syntheticEvent);
    }
  };

  // Helper to generate a sample cafe receipt on a virtual canvas for instant testing
  const handleUseSampleReceipt = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');

    // Draw receipt styling
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 400, 500);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STARBUCKS COFFEE', 200, 45);

    ctx.font = '13px monospace';
    ctx.fillText('Store #1042 - Indiranagar', 200, 70);
    ctx.fillText('Bengaluru, Karnataka', 200, 90);
    ctx.fillText('Date: 03-Oct-2026 14:32', 200, 115);

    ctx.fillText('-----------------------------------', 200, 140);
    ctx.textAlign = 'left';
    ctx.fillText('1x Caffè Mocha (Grande)', 30, 175);
    ctx.textAlign = 'right';
    ctx.fillText('₹345.00', 370, 175);

    ctx.textAlign = 'left';
    ctx.fillText('1x Blueberry Muffin', 30, 205);
    ctx.textAlign = 'right';
    ctx.fillText('₹220.00', 370, 205);

    ctx.textAlign = 'left';
    ctx.fillText('1x Hazelnut Syrup Add-on', 30, 235);
    ctx.textAlign = 'right';
    ctx.fillText('₹45.00', 370, 235);

    ctx.fillText('-----------------------------------', 200, 260);

    ctx.textAlign = 'left';
    ctx.fillText('Subtotal:', 30, 280);
    ctx.textAlign = 'right';
    ctx.fillText('₹610.00', 370, 280);

    ctx.textAlign = 'left';
    ctx.fillText('CGST 2.5% + SGST 2.5%:', 30, 300);
    ctx.textAlign = 'right';
    ctx.fillText('₹30.50', 370, 300);

    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TOTAL AMOUNT:', 30, 330);
    ctx.textAlign = 'right';
    ctx.fillText('₹640.50', 370, 330);

    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Payment: Paid via UPI (Auth #99281)', 200, 360);
    ctx.fillText('THANK YOU FOR VISITING!', 200, 400);

    canvas.toBlob((blob) => {
      if (blob) {
        const sampleFile = new File([blob], 'sample-starbucks-receipt.jpg', { type: 'image/jpeg' });
        const syntheticEvent = { target: { files: [sampleFile] } };
        handleFileChange(syntheticEvent);
      }
    }, 'image/jpeg', 0.9);
  };

  const handleScanReceipt = async () => {
    if (!file) {
      setError('Please select or drop a receipt image first.');
      return;
    }

    setLocalError('');
    setSuccess(false);

    try {
      const data = await scanReceipt(file, { scanMode, tripId, previewUrl });
      if (data) {
        setDraft({
          type: 'expense',
          amount: data.amount,
          category: data.category || 'Food & Dining',
          date: data.date,
          description: data.description,
          lineItems: data.lineItems,
          items: data.items,
          subtotal: data.subtotal,
          tax: data.tax,
          serviceCharge: data.serviceCharge,
          discount: data.discount,
          mismatch: data.mismatch,
          lowConfidenceItems: data.lowConfidenceItems,
          source: data.source,
          note: data.note,
          receiptS3Key: data.receiptKey || data.receiptS3Key || '',
          receiptUrl: data.receiptUrl || previewUrl,
        });
      }
    } catch {
      // scanReceipt sets status to 'failed' and updates scanError
    }
  };

  const handleDraftChange = (field, value) => {
    setDraft((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      // Recalculate mismatch if financial figures change
      if (['amount', 'subtotal', 'tax', 'serviceCharge', 'discount'].includes(field)) {
        const sub = Number(field === 'subtotal' ? value : next.subtotal) || 0;
        const tx = Number(field === 'tax' ? value : next.tax) || 0;
        const sc = Number(field === 'serviceCharge' ? value : next.serviceCharge) || 0;
        const dc = Number(field === 'discount' ? value : next.discount) || 0;
        const tot = Number(field === 'amount' ? value : next.amount) || 0;
        const calc = Math.round((sub + tx + sc - dc + Number.EPSILON) * 100) / 100;
        next.mismatch = Math.abs(calc - tot) > 1.0;
      }

      return next;
    });
  };

  /**
   * Editable line item changes: updating name, quantity, unit price, or price
   */
  const handleItemChange = (index, field, value) => {
    if (!draft || !draft.lineItems) return;
    const updated = [...draft.lineItems];
    const item = { ...updated[index] };

    if (field === 'price') {
      item.price = parseFloat(value) || 0;
      if (item.quantity > 0) {
        item.unitPrice = Math.round((item.price / item.quantity + Number.EPSILON) * 100) / 100;
      }
    } else if (field === 'unitPrice') {
      item.unitPrice = parseFloat(value) || 0;
      item.price = Math.round((item.unitPrice * (item.quantity || 1) + Number.EPSILON) * 100) / 100;
    } else if (field === 'quantity') {
      item.quantity = parseInt(value, 10) || 1;
      if (item.unitPrice) {
        item.price = Math.round((item.unitPrice * item.quantity + Number.EPSILON) * 100) / 100;
      }
    } else {
      item[field] = value;
    }
    item.description = item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name;
    updated[index] = item;

    const newSubtotal = Math.round((updated.reduce((acc, curr) => acc + (curr.price || 0), 0) + Number.EPSILON) * 100) / 100;
    const tax = Number(draft.tax) || 0;
    const serviceCharge = Number(draft.serviceCharge) || 0;
    const discount = Number(draft.discount) || 0;
    const newTotal = Math.round((newSubtotal + tax + serviceCharge - discount + Number.EPSILON) * 100) / 100;

    setDraft((prev) => ({
      ...prev,
      lineItems: updated,
      items: updated,
      subtotal: newSubtotal,
      amount: newTotal,
      mismatch: false, // Auto-balanced when user updates itemized prices
    }));
  };

  const handleAddItem = () => {
    if (!draft) return;
    const newItem = {
      name: 'New Item',
      description: 'New Item',
      quantity: 1,
      unitPrice: 0,
      price: 0,
      lowConfidence: false,
    };
    const updated = [...(draft.lineItems || []), newItem];
    setDraft((prev) => ({
      ...prev,
      lineItems: updated,
      items: updated,
    }));
  };

  const handleDeleteItem = (index) => {
    if (!draft || !draft.lineItems) return;
    const updated = draft.lineItems.filter((_, i) => i !== index);
    const newSubtotal = Math.round((updated.reduce((acc, curr) => acc + (curr.price || 0), 0) + Number.EPSILON) * 100) / 100;
    const tax = Number(draft.tax) || 0;
    const serviceCharge = Number(draft.serviceCharge) || 0;
    const discount = Number(draft.discount) || 0;
    const newTotal = Math.round((newSubtotal + tax + serviceCharge - discount + Number.EPSILON) * 100) / 100;

    setDraft((prev) => ({
      ...prev,
      lineItems: updated,
      items: updated,
      subtotal: newSubtotal,
      amount: newTotal,
      mismatch: false,
    }));
  };

  const handleDiscard = () => {
    setDraft(null);
    setFile(null);
    setPreviewUrl('');
    setLocalError('');
    resetScan();
    setSuccess(false);
  };

  const handleConfirmAndSave = async (asDraft = false) => {
    if (!draft) return;
    if (!draft.amount || Number(draft.amount) <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        type: 'expense',
        category: draft.category,
        amount: Number(draft.amount),
        date: draft.date,
        description: draft.description || 'Receipt Expense',
        status: asDraft ? 'draft' : 'confirmed',
        notes: draft.note || (draft.source ? `Scanned from receipt via ${draft.source}` : ''),
        receiptUrl: draft.receiptUrl || '',
        receiptS3Key: draft.receiptS3Key || '',
        metadata: {
          scanned: true,
          source: draft.source || 'aws-textract',
          subtotal: draft.subtotal,
          tax: draft.tax,
          serviceCharge: draft.serviceCharge,
          discount: draft.discount,
          lineItems: draft.lineItems,
          items: draft.items,
        },
      };

      const res = await api.post('/transactions', payload);
      setSuccess(true);
      if (onTransactionCreated) {
        onTransactionCreated(res.data?.data || res.data);
      }
      setTimeout(() => {
        handleDiscard();
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        padding: compact ? '0.75rem' : '1.25rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            🧾 Smart Receipt Scanner
          </h4>
          <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Scan receipts to auto-extract items, tax, and totals with AWS Textract
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setScanMode((prev) => (prev === 'auto' ? 'direct' : 'auto'))}
            title={scanMode === 'auto' ? 'Click to switch to Direct Synchronous Scan' : 'Click to switch to S3 Async Pipeline'}
            style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: scanMode === 'auto' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(16, 185, 129, 0.12)',
              color: scanMode === 'auto' ? '#818CF8' : 'var(--accent-success)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {scanMode === 'auto' ? '⚡ MODE: S3 + ASYNC' : '⚡ MODE: DIRECT SYNC'}
          </button>
        </div>
      </div>

      {/* Upload Zone */}
      {!draft && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '2px dashed var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: compact ? '1rem' : '1.5rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: file ? 'rgba(99, 102, 241, 0.04)' : 'transparent',
            transition: 'border-color 0.2s',
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/jpg,application/pdf,image/heic,image/heif"
            aria-label="Upload receipt document"
            style={{ display: 'none' }}
          />

          {file ? (
            <div>
              {previewUrl && file.type?.startsWith('image/') ? (
                <img
                  src={previewUrl}
                  alt="Receipt Preview"
                  style={{
                    maxHeight: '110px',
                    maxWidth: '100%',
                    borderRadius: 'var(--radius-sm, 6px)',
                    marginBottom: '8px',
                    objectFit: 'contain',
                    border: '1px solid var(--border-color)',
                  }}
                />
              ) : (
                <span style={{ fontSize: '1.5rem' }}>📄</span>
              )}
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: '4px' }}>{file.name}</div>
              <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                {(file.size / 1024).toFixed(1)} KB • Click or drop another to replace
              </div>
            </div>
          ) : (
            <div>
              <span style={{ fontSize: '1.75rem' }}>📸</span>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: '4px' }}>
                Drop receipt photo here or click to browse
              </div>
              <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '2px' }}>
                Supports JPEG, PNG, PDF, and HEIC (auto-converted to JPEG)
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress & Status Indicator */}
      {scanning && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
            <span>
              {scanStatus === 'uploading'
                ? 'Uploading receipt to encrypted private S3...'
                : 'AWS Textract analyzing line items and prices...'}
            </span>
            <span>{uploadProgress}%</span>
          </div>
          <div
            style={{
              width: '100%',
              height: '6px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-secondary)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${uploadProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #6366f1, #10b981)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Controls & Sample Button */}
      {!draft && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginTop: '0.75rem',
          }}
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleUseSampleReceipt}
            style={{
              padding: '0 12px',
              height: '32px',
              fontSize: '0.74rem',
            }}
          >
            ⚡ Try with Sample Receipt
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleScanReceipt}
            disabled={scanning || !file}
            loading={scanning}
            style={{ padding: '6px 20px', fontSize: '0.82rem' }}
          >
            🔍 Scan Receipt
          </Button>
        </div>
      )}

      {/* Error & Retry Banner */}
      {error && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--accent-danger)',
            fontSize: '0.8rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>⚠️</span>
            <span style={{ flex: 1 }}>{error}</span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '2px' }}>
            {file && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleScanReceipt}
                disabled={scanning}
                style={{
                  height: '28px',
                  padding: '0 12px',
                  fontSize: '0.72rem',
                  borderColor: 'rgba(239, 68, 68, 0.4)',
                  color: 'var(--text-primary)',
                }}
              >
                🔄 Retry Scan
              </Button>
            )}

            {scanMode === 'auto' && file && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setScanMode('direct');
                  setTimeout(() => handleScanReceipt(), 50);
                }}
                disabled={scanning}
                style={{
                  height: '28px',
                  padding: '0 12px',
                  fontSize: '0.72rem',
                  borderColor: 'rgba(99, 102, 241, 0.4)',
                  color: 'var(--accent-primary)',
                }}
              >
                ⚡ Retry with Direct Server Scan
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Success */}
      {success && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: 'var(--accent-success)',
            fontSize: '0.82rem',
          }}
        >
          ✅ Receipt expense confirmed and saved!
        </div>
      )}

      {/* ======================================================== */}
      {/* EDITABLE CONFIRMATION CARD (Never save without confirm)  */}
      {/* ======================================================== */}
      {draft && (
        <div
          style={{
            marginTop: '1rem',
            padding: '1.25rem',
            borderRadius: 'var(--radius-lg)',
            border: '2px solid var(--accent-primary-light)',
            background: 'var(--bg-primary)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.75rem',
              paddingBottom: '0.5rem',
              borderBottom: '1px solid var(--divider-color)',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Review & Confirm Receipt Details
              </div>
              <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '2px' }}>
                Extracted via AWS Textract AnalyzeExpense • Adjust line items before saving
              </div>
            </div>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(245, 158, 11, 0.15)',
                color: 'var(--accent-warning)',
              }}
            >
              {draft.source}
            </span>
          </div>

          {/* Mismatch Warning Alert Banner */}
          {draft.mismatch && (
            <div
              style={{
                padding: '0.6rem 0.8rem',
                marginBottom: '0.85rem',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: 'var(--accent-danger, #ef4444)',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>⚠️</span>
              <div>
                <strong>Check the totals:</strong> The sum of line items (₹{Number(draft.subtotal).toFixed(2)}) + tax (₹{Number(draft.tax).toFixed(2)}) + service charge (₹{Number(draft.serviceCharge).toFixed(2)}) - discount (₹{Number(draft.discount).toFixed(2)}) differs from the final total (₹{Number(draft.amount).toFixed(2)}) by more than ₹1. Please review and adjust the fields below.
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                TOTAL AMOUNT (₹)
              </label>
              <input
                type="number"
                step="any"
                className="input-glass"
                value={draft.amount}
                onChange={(e) => handleDraftChange('amount', e.target.value)}
                style={{ fontWeight: 700, fontSize: '1.05rem', borderColor: draft.mismatch ? 'var(--accent-danger)' : undefined }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                MERCHANT / VENDOR
              </label>
              <input
                type="text"
                className="input-glass"
                value={draft.description}
                onChange={(e) => handleDraftChange('description', e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                CATEGORY
              </label>
              <select
                className="input-glass"
                value={draft.category}
                onChange={(e) => handleDraftChange('category', e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                RECEIPT DATE
              </label>
              <input
                type="date"
                className="input-glass"
                value={draft.date}
                onChange={(e) => handleDraftChange('date', e.target.value)}
              />
            </div>
          </div>

          {/* EDITABLE CHARGES ROW (Subtotal, Tax, Service Charge, Discount) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.6rem', marginTop: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Subtotal (₹)
              </label>
              <input
                type="number"
                step="any"
                className="input-glass"
                value={draft.subtotal}
                onChange={(e) => handleDraftChange('subtotal', e.target.value)}
                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Tax / GST (₹)
              </label>
              <input
                type="number"
                step="any"
                className="input-glass"
                value={draft.tax}
                onChange={(e) => handleDraftChange('tax', e.target.value)}
                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Service Charge (₹)
              </label>
              <input
                type="number"
                step="any"
                className="input-glass"
                value={draft.serviceCharge}
                onChange={(e) => handleDraftChange('serviceCharge', e.target.value)}
                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Discount (₹)
              </label>
              <input
                type="number"
                step="any"
                className="input-glass"
                value={draft.discount}
                onChange={(e) => handleDraftChange('discount', e.target.value)}
                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
              />
            </div>
          </div>

          {/* EDITABLE LINE ITEMS TABLE */}
          <div
            style={{
              marginTop: '0.85rem',
              padding: '0.75rem 0.85rem',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                EDITABLE LINE ITEMS ({draft.lineItems?.length || 0})
              </span>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAddItem}
                  style={{ fontSize: '0.7rem', padding: '2px 8px', height: '24px' }}
                >
                  + Add Item
                </Button>
              </div>
            </div>

            {draft.lowConfidenceItems?.length > 0 && (
              <div
                style={{
                  padding: '0.4rem 0.6rem',
                  marginBottom: '0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: 'var(--accent-warning, #f59e0b)',
                  fontSize: '0.72rem',
                  fontWeight: 500,
                }}
              >
                ⚠️ {draft.lowConfidenceItems.length} item(s) detected with low confidence (&lt;80%). Highlighted below for your review.
              </div>
            )}

            {/* Items Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {(!draft.lineItems || draft.lineItems.length === 0) && (
                <div
                  style={{
                    padding: '0.75rem',
                    textAlign: 'center',
                    background: 'var(--bg-primary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px dashed var(--border-color)',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  ℹ️ No line items detected by OCR. You can click <strong>+ Add Item</strong> above to enter them manually for itemized splitting.
                </div>
              )}
              {(draft.lineItems || []).map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px, 1fr) 45px 70px 75px 25px',
                    gap: '0.4rem',
                    alignItems: 'center',
                    padding: '4px 6px',
                    borderRadius: 'var(--radius-sm)',
                    background: item.lowConfidence ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-primary)',
                    border: item.lowConfidence ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-color)',
                  }}
                >
                  <input
                    type="text"
                    className="input-glass"
                    value={item.name}
                    placeholder="Description"
                    onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                    style={{ fontSize: '0.75rem', padding: '4px 6px', height: '28px' }}
                  />
                  <input
                    type="number"
                    min="1"
                    className="input-glass"
                    value={item.quantity}
                    placeholder="Qty"
                    onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                    style={{ fontSize: '0.75rem', padding: '4px 4px', height: '28px', textAlign: 'center' }}
                  />
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="input-glass"
                    value={item.unitPrice !== undefined ? item.unitPrice : ''}
                    placeholder="Unit ₹"
                    onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                    style={{ fontSize: '0.75rem', padding: '4px 6px', height: '28px' }}
                  />
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="input-glass"
                    value={item.price}
                    placeholder="Total ₹"
                    onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                    style={{ fontSize: '0.75rem', padding: '4px 6px', height: '28px', fontWeight: 600 }}
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(idx)}
                    title="Remove item"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.65rem',
              marginTop: '1rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--divider-color)',
            }}
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDiscard}
              disabled={saving}
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              Discard
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => handleConfirmAndSave(false)}
              disabled={saving || !draft.amount || Number(draft.amount) <= 0}
              loading={saving}
              style={{ fontSize: '0.8rem', padding: '6px 18px' }}
            >
              Confirm & Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptScannerBox;
