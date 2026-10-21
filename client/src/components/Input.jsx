import { forwardRef, useId } from 'react';

/**
 * Quiet Ledger Input Component
 *
 * - Real <label> above input
 * - 52px tall input by default
 * - 14px border radius (var(--radius-input))
 * - Visible 2px ink focus ring
 * - Inline error message in warning color (#B45309)
 * - Accessible with proper aria-invalid and aria-describedby
 * - Supports rightAction (e.g. show/hide password button)
 */
const Input = forwardRef(
  (
    {
      label,
      type = 'text',
      id: customId,
      name,
      value,
      onChange,
      placeholder,
      error,
      hint,
      disabled = false,
      required = false,
      rightAction,
      className = '',
      inputClassName = '',
      style = {},
      inputStyle = {},
      autoComplete,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = customId || generatedId;
    const errorId = error ? `${id}-error` : undefined;
    const hintId = hint ? `${id}-hint` : undefined;

    return (
      <div className={`input-field ${className}`} style={{ width: '100%', ...style }}>
        {label && (
          <label
            htmlFor={id}
            style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: '0.88rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            {label}
            {required && <span aria-hidden="true" style={{ color: 'var(--color-warning)', marginLeft: '3px' }}>*</span>}
          </label>
        )}

        <div style={{ position: 'relative', width: '100%' }}>
          <input
            ref={ref}
            id={id}
            name={name}
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            autoComplete={autoComplete}
            aria-invalid={Boolean(error)}
            aria-describedby={errorId || hintId || undefined}
            className={`form-input ${inputClassName}`}
            style={{
              width: '100%',
              height: '52px',
              padding: rightAction ? '0 48px 0 16px' : '0 16px',
              borderRadius: 'var(--radius-input, 14px)',
              border: `1px solid ${error ? 'var(--color-warning)' : 'var(--border-color)'}`,
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.95rem',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color var(--transition-fast), outline var(--transition-fast)',
              ...inputStyle,
            }}
            {...props}
          />

          {rightAction && (
            <div
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {rightAction}
            </div>
          )}
        </div>

        {error && (
          <div
            id={errorId}
            role="alert"
            className="inline-error"
            style={{
              fontSize: '0.82rem',
              color: 'var(--color-warning)',
              marginTop: '5px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {!error && hint && (
          <p
            id={hintId}
            style={{
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
              marginTop: '5px',
              marginBottom: 0,
            }}
          >
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
