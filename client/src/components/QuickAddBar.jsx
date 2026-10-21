import { useState } from 'react';
import Button from './Button.jsx';

/**
 * QuickAddBar
 *
 * Pinned to the bottom of the screen with input, mic, and camera scan actions.
 * Placeholder: "Type, speak, or scan"
 */
const QuickAddBar = ({
  onSubmit,
  onVoiceClick,
  onScanClick,
  className = '',
  style = {},
}) => {
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    if (onSubmit) {
      onSubmit(value.trim());
    }
    setValue('');
  };

  return (
    <div
      className={`quick-add-dock ${className}`}
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 2rem)',
        maxWidth: '560px',
        zIndex: 90,
        ...style,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px 6px 16px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-full)',
          boxShadow: 'var(--shadow-lg)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <span
          style={{
            fontSize: '1rem',
            color: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
          }}
          aria-hidden="true"
        >
          ✦
        </span>

        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type, speak, or scan..."
          aria-label="Quick add transaction input"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: '0.92rem',
            fontFamily: 'inherit',
          }}
        />

        {/* Mic action */}
        <button
          type="button"
          onClick={onVoiceClick}
          aria-label="Speak transaction with voice"
          title="Speak transaction"
          className="btn-icon-round"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>

        {/* Scan receipt action */}
        <button
          type="button"
          onClick={onScanClick}
          aria-label="Scan receipt image"
          title="Scan receipt"
          className="btn-icon-round"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>

        {/* Submit arrow button (shows when text is entered) */}
        {value.trim() && (
          <Button
            type="submit"
            size="sm"
            aria-label="Submit quick add"
          >
            Add &rarr;
          </Button>
        )}
      </form>
    </div>
  );
};

export default QuickAddBar;
