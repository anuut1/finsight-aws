import { useEffect } from 'react';

/**
 * Quiet Ledger Modal Component
 *
 * Minimalist, editorial modal with Instrument Serif title, 20px card radius,
 * hairline borders, and smooth backdrop.
 */
const Modal = ({ title, isOpen, onClose, children }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 21, 26, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(560px, 94vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-surface, #FFFFFF)',
          border: '1px solid var(--border-color, #E8E8E4)',
          borderRadius: 'var(--radius-card, 20px)',
          boxShadow: '0 20px 40px -15px rgba(20, 21, 26, 0.12)',
          padding: '1.75rem 2rem',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--border-color, #E8E8E4)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-heading, "Instrument Serif", serif)',
              fontSize: '1.75rem',
              fontWeight: 400,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="btn-icon-round modal-close"
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  );
};

export default Modal;
