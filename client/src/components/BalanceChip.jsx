/**
 * BalanceChip
 *
 * Compact fintech indicator chip.
 * Emerald for money owed to user (+), Coral for money user owes (-).
 * Always pairs color with +/- sign and tabular figures.
 */
const BalanceChip = ({
  amount = 0,
  label = '',
  direction = null, // 'owed' | 'owes' | null (inferred from sign)
  size = 'md', // 'sm' | 'md'
  className = '',
  style = {},
}) => {
  const numeric = typeof amount === 'number' ? amount : Number(amount) || 0;
  const isOwed = direction === 'owed' || (direction === null && numeric > 0);
  const isOwes = direction === 'owes' || (direction === null && numeric < 0);

  const color = isOwed
    ? 'var(--color-positive)'
    : isOwes
    ? 'var(--color-negative)'
    : 'var(--text-muted)';

  const bg = isOwed
    ? 'var(--color-positive-bg)'
    : isOwes
    ? 'var(--color-negative-bg)'
    : 'var(--bg-surface-elevated)';

  const border = isOwed
    ? 'var(--color-positive-border)'
    : isOwes
    ? 'var(--color-negative-border)'
    : 'var(--border-color)';

  const sign = isOwed ? '+' : isOwes ? '−' : '';

  return (
    <span
      className={`balance-chip ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
        borderRadius: 'var(--radius-full)',
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: size === 'sm' ? '0.74rem' : '0.82rem',
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.01em',
        lineHeight: 1.2,
        ...style,
      }}
    >
      {label && <span style={{ opacity: 0.85, fontWeight: 500 }}>{label}:</span>}
      <span className="num-tabular">
        {sign}₹{Math.abs(numeric).toLocaleString('en-IN')}
      </span>
    </span>
  );
};

export default BalanceChip;
