import { useState } from 'react';
import api from '../api/axios';
import Modal from './Modal';
import Button from './Button';

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
  'Other',
];

const SAMPLE_ALERTS = [
  {
    label: 'Swiggy UPI',
    text: 'Dear Customer, INR 450.00 debited from A/C **1234 on 03-OCT-26 to SWIGGY UPI: swiggy@icici Ref: 6271891029. Avl Bal: INR 12,340.50',
  },
  {
    label: 'Uber Card',
    text: 'INR 350.00 spent on Axis Bank Card ending 9876 at UBER TRIP on 03-Oct-26. Avail Lmt: INR 85,000.',
  },
  {
    label: 'Salary Credit',
    text: 'Dear Customer, your A/C **5678 has been credited with INR 85,000.00 on 01-Oct-26 by Salary. Avl Bal: INR 92,400.00.',
  },
  {
    label: 'PhonePe Coffee',
    text: 'Paid ₹650 to Blue Tokai Coffee Roasters using UPI on 03 Oct 2026.',
  },
];

const BankAlertImportModal = ({ isOpen, onClose, onTransactionCreated }) => {
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleParse = async (overrideText) => {
    const rawToParse = (overrideText !== undefined ? overrideText : text).trim();
    if (!rawToParse) {
      setParseError('Please paste an SMS or bank notification text first.');
      return;
    }

    setParsing(true);
    setParseError('');
    setSuccess(false);

    try {
      const res = await api.post('/transactions/parse-bank-alert', {
        text: rawToParse,
        currentDate: new Date().toISOString().slice(0, 10),
      });

      if (res.data?.success && res.data.data) {
        setDraft(res.data.data);
      } else {
        setParseError('Could not recognize bank alert format. Please check the text.');
      }
    } catch (err) {
      setParseError(err.response?.data?.message || 'Failed to parse bank alert.');
    } finally {
      setParsing(false);
    }
  };

  const handleDraftChange = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleDiscard = () => {
    setDraft(null);
    setParseError('');
    setSuccess(false);
  };

  const handleConfirmAndSave = async () => {
    if (!draft) return;
    if (!draft.amount || Number(draft.amount) <= 0) {
      setParseError('Please enter a valid amount greater than 0.');
      return;
    }

    setSaving(true);
    setParseError('');

    try {
      const payload = {
        type: draft.type,
        category: draft.category,
        amount: Number(draft.amount),
        description: draft.description,
        date: draft.date,
        tags: draft.tags || ['bank-alert'],
        mood: draft.mood || 'neutral',
      };

      const res = await api.post('/transactions', payload);
      if (res.data?.success) {
        setSuccess(true);
        setDraft(null);
        setText('');
        if (onTransactionCreated) {
          onTransactionCreated(res.data.data);
        }
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1200);
      }
    } catch (err) {
      setParseError(err.response?.data?.message || 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="📨 Paste Bank / UPI Alert SMS or Email" isOpen={isOpen} onClose={onClose}>
      <div>
        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 0, marginBottom: '0.85rem' }}>
          Paste the notification SMS or email you received from your bank (HDFC, SBI, ICICI, Axis, PhonePe, GPay, Paytm, etc.). FinSight will parse the amount, merchant, and date into an editable confirmation draft.
        </p>

        {/* Textarea Input */}
        <div style={{ marginBottom: '0.65rem' }}>
          <textarea
            className="input-glass"
            rows={4}
            placeholder="Paste SMS here... e.g. 'Dear Customer, INR 450.00 debited from A/C **1234 on 03-OCT-26 to SWIGGY UPI...'"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={parsing}
            style={{ width: '100%', fontSize: '0.82rem', resize: 'vertical' }}
          />
        </div>

        {/* Quick Sample Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
          <span className="text-muted" style={{ fontSize: '0.72rem' }}>
            Try sample:
          </span>
          {SAMPLE_ALERTS.map((sample, idx) => (
            <Button
              key={idx}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setText(sample.text);
                handleParse(sample.text);
              }}
              style={{
                fontSize: '0.72rem',
                padding: '0 10px',
                height: '28px',
                minHeight: '28px',
              }}
            >
              {sample.label}
            </Button>
          ))}
        </div>

        {/* Parse Button */}
        {!draft && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => handleParse()}
              disabled={parsing || !text.trim()}
              loading={parsing}
              style={{ padding: '7px 18px', fontSize: '0.82rem' }}
            >
              ⚡ Parse SMS / Alert
            </Button>
          </div>
        )}

        {/* Error notification */}
        {parseError && (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--accent-danger)',
              fontSize: '0.8rem',
              marginBottom: '0.85rem',
            }}
          >
            ⚠️ {parseError}
          </div>
        )}

        {/* Success notification */}
        {success && (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--accent-success)',
              fontSize: '0.82rem',
              marginBottom: '0.85rem',
              textAlign: 'center',
            }}
          >
            ✅ Transaction confirmed and saved successfully!
          </div>
        )}

        {/* ======================================================== */}
        {/* EDITABLE CONFIRMATION CARD (Never save without confirm)  */}
        {/* ======================================================== */}
        {draft && (
          <div
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              border: '2px solid var(--accent-primary-light)',
              background: 'var(--bg-secondary)',
              marginTop: '0.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '0.5rem',
                borderBottom: '1px solid var(--divider-color)',
                marginBottom: '0.75rem',
              }}
            >
              <div>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                  Review & Confirm Draft
                </span>
                <span className="text-muted" style={{ fontSize: '0.72rem', display: 'block' }}>
                  Parsed from bank SMS • Never saved without confirmation
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  background: draft.type === 'expense' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: draft.type === 'expense' ? 'var(--color-expense)' : 'var(--color-income)',
                }}
              >
                {draft.type}
              </span>
            </div>

            {/* Grid of editable fields */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.65rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>TYPE</label>
                <select
                  className="input-glass"
                  value={draft.type}
                  onChange={(e) => handleDraftChange('type', e.target.value)}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>AMOUNT (₹)</label>
                <input
                  type="number"
                  step="any"
                  className="input-glass"
                  value={draft.amount}
                  onChange={(e) => handleDraftChange('amount', e.target.value)}
                  style={{ fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>CATEGORY</label>
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
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>DATE</label>
                <input
                  type="date"
                  className="input-glass"
                  value={draft.date}
                  onChange={(e) => handleDraftChange('date', e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: '0.65rem' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                MERCHANT / DESCRIPTION
              </label>
              <input
                type="text"
                className="input-glass"
                value={draft.description}
                onChange={(e) => handleDraftChange('description', e.target.value)}
              />
            </div>

            {/* Tags preview */}
            {draft.tags?.length > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {draft.tags.map((tag, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: '0.65rem',
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-full)',
                      background: 'rgba(82, 85, 119, 0.15)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Confirmation actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', paddingTop: '0.65rem', borderTop: '1px solid var(--divider-color)' }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleDiscard}
                disabled={saving}
                style={{ fontSize: '0.78rem', padding: '6px 14px' }}
              >
                Discard
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleConfirmAndSave}
                disabled={saving || !draft.amount || Number(draft.amount) <= 0}
                loading={saving}
                style={{ fontSize: '0.78rem', padding: '6px 18px', fontWeight: 700 }}
              >
                ✓ Confirm & Save Transaction
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BankAlertImportModal;
