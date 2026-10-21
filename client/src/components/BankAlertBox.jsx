import { useState } from 'react';
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

const BankAlertBox = ({ onTransactionCreated, compact = false }) => {
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

  const handleConfirmAndSave = async (asDraft = false) => {
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
        isDraft: asDraft,
        status: asDraft ? 'draft' : 'confirmed',
      };

      const res = await api.post('/transactions', payload);
      if (res.data?.success) {
        setSuccess(true);
        setDraft(null);
        setText('');
        if (onTransactionCreated) {
          onTransactionCreated(res.data.data);
        }
        setTimeout(() => setSuccess(false), 3500);
      }
    } catch (err) {
      setParseError(err.response?.data?.message || 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: compact ? 'transparent' : 'var(--bg-secondary)',
        borderRadius: 'var(--radius-xl)',
        padding: compact ? '0' : '1.25rem',
        border: compact ? 'none' : '1px solid var(--border-color)',
        marginBottom: compact ? '0' : '1.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.1rem' }}>📨</span>
          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            Paste Bank SMS / Email Alert
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(99, 102, 241, 0.15)',
              color: 'var(--accent-primary-light)',
              fontWeight: 600,
            }}
          >
            UPI & Cards
          </span>
        </div>
        <span className="text-muted" style={{ fontSize: '0.72rem' }}>
          Never saved without confirmation
        </span>
      </div>

      <div style={{ position: 'relative' }}>
        <textarea
          className="input-glass"
          rows={compact ? 3 : 4}
          placeholder="Paste your bank or UPI alert here... e.g. 'Dear Customer, INR 450.00 debited from A/C **1234 on 03-OCT-26 to SWIGGY UPI...'"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={parsing}
          style={{ width: '100%', fontSize: '0.82rem', resize: 'vertical' }}
        />
      </div>

      {/* Suggested Samples */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem', marginBottom: '0.75rem' }}>
        <span className="text-muted" style={{ fontSize: '0.72rem' }}>
          Try:
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

      {/* Parse Trigger Button */}
      {!draft && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => handleParse()}
            disabled={parsing || !text.trim()}
            loading={parsing}
            style={{ padding: '6px 18px', fontSize: '0.82rem' }}
          >
            ⚡ Parse SMS into Draft
          </Button>
        </div>
      )}

      {/* Error message */}
      {parseError && (
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--accent-danger)',
            fontSize: '0.8rem',
          }}
        >
          ⚠️ {parseError}
        </div>
      )}

      {/* Success alert */}
      {success && (
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: 'var(--accent-success)',
            fontSize: '0.82rem',
          }}
        >
          ✅ Transaction confirmed and saved to your records!
        </div>
      )}

      {/* ======================================================== */}
      {/* EDITABLE CONFIRMATION CARD (Never save without confirm)  */}
      {/* ======================================================== */}
      {draft && (
        <div
          style={{
            marginTop: '0.85rem',
            padding: '1.15rem',
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
                Review & Confirm Parsed Transaction
              </div>
              <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '2px' }}>
                Extracted from bank SMS. Please review before saving.
              </div>
            </div>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: draft.type === 'expense' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: draft.type === 'expense' ? 'var(--color-expense)' : 'var(--color-income)',
                textTransform: 'uppercase',
              }}
            >
              {draft.type}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                TYPE
              </label>
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
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                AMOUNT (₹)
              </label>
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
                DATE
              </label>
              <input
                type="date"
                className="input-glass"
                value={draft.date}
                onChange={(e) => handleDraftChange('date', e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
              MERCHANT / DESCRIPTION
            </label>
            <input
              type="text"
              className="input-glass"
              value={draft.description}
              onChange={(e) => handleDraftChange('description', e.target.value)}
            />
          </div>

          {/* Tags */}
          {draft.tags?.length > 0 && (
            <div style={{ marginTop: '0.65rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {draft.tags.map((tag, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(82, 85, 119, 0.12)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Buttons */}
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
              variant="secondary"
              size="sm"
              onClick={() => handleConfirmAndSave(true)}
              disabled={saving || !draft.amount || Number(draft.amount) <= 0}
              style={{
                fontSize: '0.8rem',
                padding: '6px 14px',
                borderColor: '#6366F1',
                color: '#A5B4FC',
              }}
            >
              💾 Save as Draft
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => handleConfirmAndSave(false)}
              disabled={saving || !draft.amount || Number(draft.amount) <= 0}
              loading={saving}
              style={{ fontSize: '0.82rem', padding: '7px 20px', fontWeight: 700 }}
            >
              ✓ Confirm & Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankAlertBox;
