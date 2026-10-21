/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import Input from './Input.jsx';
import Button from './Button.jsx';

const EXPENSE_CATEGORIES = [
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
  'Shared',
  'Other',
];

const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investment',
  'Gift',
  'Refund',
  'Other',
];

/**
 * Quiet Ledger Transaction Form
 *
 * Provides resilient, accessible manual transaction entry and editing.
 * Validates inputs, handles category defaults, and displays inline errors.
 */
const TransactionForm = ({ initialValues, onSubmit, submitting = false, onCancel }) => {
  const isEditing = Boolean(initialValues && initialValues._id);

  const [type, setType] = useState(initialValues?.type || 'expense');
  const [amount, setAmount] = useState(initialValues?.amount ? String(initialValues.amount) : '');
  const [category, setCategory] = useState(
    initialValues?.category || (initialValues?.type === 'income' ? 'Salary' : 'Food & Dining')
  );
  const [customCategory, setCustomCategory] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [description, setDescription] = useState(initialValues?.description || '');
  const [date, setDate] = useState(
    initialValues?.date
      ? new Date(initialValues.date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [mood, setMood] = useState(initialValues?.mood || 'neutral');
  const [error, setError] = useState('');

  // Sync state if initialValues changes (e.g. user opens modal for different transaction)
  useEffect(() => {
    if (initialValues) {
      setType(initialValues.type || 'expense');
      setAmount(initialValues.amount ? String(initialValues.amount) : '');
      const cat = initialValues.category || 'Food & Dining';
      const catList = initialValues.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      if (catList.includes(cat)) {
        setCategory(cat);
        setIsCustomCategory(false);
      } else {
        setCategory('Other');
        setIsCustomCategory(true);
        setCustomCategory(cat);
      }
      setDescription(initialValues.description || '');
      setDate(
        initialValues.date
          ? new Date(initialValues.date).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10)
      );
      setMood(initialValues.mood || 'neutral');
    }
  }, [initialValues]);

  // Handle switching type
  const handleTypeChange = (newType) => {
    setType(newType);
    setError('');
    if (!isEditing) {
      if (newType === 'income') {
        setCategory('Salary');
        setIsCustomCategory(false);
      } else {
        setCategory('Food & Dining');
        setIsCustomCategory(false);
      }
    }
  };

  const handleCategorySelect = (val) => {
    setCategory(val);
    setError('');
    if (val === 'Other') {
      setIsCustomCategory(true);
    } else {
      setIsCustomCategory(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    const finalCategory = isCustomCategory ? customCategory.trim() : category.trim();
    if (!finalCategory) {
      setError('Please select or enter a category.');
      return;
    }

    if (!date) {
      setError('Please select a valid date.');
      return;
    }

    const payload = {
      type,
      category: finalCategory,
      amount: parsedAmount,
      description: description.trim() || undefined,
      date,
      mood,
    };

    try {
      if (onSubmit) {
        await onSubmit(payload);
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save transaction. Please check your inputs.';
      setError(msg);
    }
  };

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Type Toggle (Expense / Income) */}
      <div>
        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '0.88rem',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          Transaction Type
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            background: 'var(--bg-surface-elevated, #F4F4F2)',
            padding: '4px',
            borderRadius: '999px',
            border: '1px solid var(--border-color)',
          }}
        >
          <Button
            type="button"
            variant={type === 'expense' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => handleTypeChange('expense')}
            style={{
              width: '100%',
              borderRadius: '999px',
              border: type === 'expense' ? undefined : 'none',
            }}
          >
            Expense
          </Button>
          <Button
            type="button"
            variant={type === 'income' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => handleTypeChange('income')}
            style={{
              width: '100%',
              borderRadius: '999px',
              border: type === 'income' ? undefined : 'none',
            }}
          >
            Income
          </Button>
        </div>
      </div>

      {/* Amount and Date */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
        <Input
          label="Amount (₹)"
          id="tx-amount"
          name="amount"
          type="number"
          step="any"
          min="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError('');
          }}
          required
          autoFocus
        />

        <Input
          label="Date"
          id="tx-date"
          name="date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setError('');
          }}
          required
        />
      </div>

      {/* Category Dropdown */}
      <div className="input-field" style={{ width: '100%' }}>
        <label
          htmlFor="tx-category"
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '0.88rem',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          Category <span style={{ color: 'var(--color-warning)' }}>*</span>
        </label>
        <select
          id="tx-category"
          value={isCustomCategory ? 'Other' : category}
          onChange={(e) => handleCategorySelect(e.target.value)}
          className="form-input"
          style={{
            width: '100%',
            height: '52px',
            padding: '0 16px',
            borderRadius: 'var(--radius-input, 14px)',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            fontSize: '0.95rem',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* If "Other" category is chosen, allow typing custom name */}
      {isCustomCategory && (
        <Input
          label="Custom Category Name"
          id="tx-custom-category"
          placeholder="e.g. Freelance Client, Pet Supplies"
          value={customCategory}
          onChange={(e) => {
            setCustomCategory(e.target.value);
            setError('');
          }}
          required
        />
      )}

      {/* Description */}
      <Input
        label="Description (optional)"
        id="tx-desc"
        name="description"
        placeholder={type === 'expense' ? 'e.g. Swiggy lunch, Uber to airport' : 'e.g. October monthly salary'}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {/* Mood / Sentiment (optional) */}
      <div className="input-field">
        <label
          htmlFor="tx-mood"
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '0.88rem',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          Feeling / Context
        </label>
        <select
          id="tx-mood"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          className="form-input"
          style={{
            width: '100%',
            height: '52px',
            padding: '0 16px',
            borderRadius: 'var(--radius-input, 14px)',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            fontSize: '0.95rem',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        >
          <option value="happy">Good / Necessary</option>
          <option value="neutral">Neutral / Everyday</option>
          <option value="stressed">Stressed / Impulse</option>
        </select>
      </div>

      {/* Inline Form Error */}
      {error && (
        <div
          role="alert"
          style={{
            fontSize: '0.88rem',
            color: 'var(--color-warning)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            borderRadius: 'var(--radius-input, 14px)',
            background: 'rgba(180, 83, 9, 0.08)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
        )}
        <Button variant="primary" type="submit" loading={submitting} disabled={submitting}>
          {isEditing ? 'Save Changes' : 'Save Transaction'}
        </Button>
      </div>
    </form>
  );
};

export default TransactionForm;
