import { useReducedMotion } from 'motion/react';

/**
 * Quiet Ledger Progress Bar
 *
 * Minimal, thin progress bar with smooth filling and no gradient washes.
 */
const ProgressBar = ({ value = 0, tone = 'primary', height = 4, className = '', style = {} }) => {
  const prefersReducedMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));

  const toneColors = {
    primary: 'var(--color-ink)',
    positive: 'var(--color-positive)',
    warning: 'var(--color-warning)',
    negative: 'var(--color-warning)',
  };

  const fillBackground = toneColors[tone] || toneColors.primary;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={className}
      style={{
        width: '100%',
        height,
        borderRadius: 'var(--radius-full, 999px)',
        background: 'var(--track-bg, #E8E8E4)',
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${clamped}%`,
          borderRadius: 'var(--radius-full, 999px)',
          background: fillBackground,
          transition: prefersReducedMotion ? 'none' : 'width 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />
    </div>
  );
};

export default ProgressBar;
