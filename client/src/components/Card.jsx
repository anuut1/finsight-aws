import { forwardRef } from 'react';

/**
 * Quiet Ledger Card component
 *
 * Minimal, airy surface with 20px radius, 1px subtle border, no heavy shadows,
 * no glassmorphism, and no gradient washes.
 */
const Card = forwardRef(
  (
    {
      children,
      className = '',
      style = {},
      hoverable = false,
      onClick,
      ...props
    },
    ref
  ) => {
    const baseStyle = {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-card, 20px)',
      boxShadow: 'none',
      padding: 'var(--spacing-xl, 1.5rem)',
      position: 'relative',
      overflow: 'hidden',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background var(--transition-base), border-color var(--transition-base), transform var(--transition-fast)',
      ...style,
    };

    return (
      <div
        ref={ref}
        className={`ledger-card ${hoverable ? 'ledger-card-hoverable' : ''} ${className}`}
        style={baseStyle}
        onClick={onClick}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export default Card;
