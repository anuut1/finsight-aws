import { forwardRef } from 'react';

/**
 * Quiet Ledger Pill Button
 *
 * - Single source of truth for all button actions across FinSight
 * - Fully pill-shaped (999px radius)
 * - Variants: 'primary' | 'secondary' | 'ghost' | 'danger' (also 'outline' alias)
 * - Sizes: 'sm' (36px) | 'md' (44px) | 'lg' (52px)
 * - Motion spec: hover lift (-1px), active press (scale 0.98), 2px focus ring
 * - Loading: label stays, small 16px spinner fades in, aria-busy="true", keeps width
 * - Optional success state: brief 1.2s label swap with short fade
 */
const Button = forwardRef(
  (
    {
      children,
      variant = 'primary', // 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
      size = 'md', // 'sm' | 'md' | 'lg'
      fullWidth = false,
      loading = false,
      disabled = false,
      success = false,
      successText = 'Done',
      type = 'button',
      className = '',
      style = {},
      icon,
      onClick,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const normalizedVariant = variant === 'outline' ? 'outline' : variant;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading ? 'true' : undefined}
        onClick={onClick}
        className={`btn btn-${normalizedVariant} btn-${size} ${fullWidth ? 'btn-block' : ''} ${loading ? 'is-loading' : ''} ${className}`.trim()}
        style={style}
        {...props}
      >
        {success ? (
          <span className="btn-feedback-swap">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{successText}</span>
          </span>
        ) : (
          <>
            {loading && <span className="btn-spinner" aria-hidden="true" />}
            {!loading && icon && (
              <span className="btn-icon" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
                {icon}
              </span>
            )}
            {children !== undefined && children !== null && <span>{children}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
