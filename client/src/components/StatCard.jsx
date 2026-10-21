import Card from './Card.jsx';

const StatCard = ({ label, value, subtitle, tone = 'neutral' }) => {
  const toneConfig = {
    positive: {
      color: 'var(--color-positive)',
      bg: 'var(--color-positive-bg)',
      icon: '+',
    },
    negative: {
      color: 'var(--color-negative)',
      bg: 'var(--color-negative-bg)',
      icon: '−',
    },
    neutral: {
      color: 'var(--text-primary)',
      bg: 'transparent',
      icon: '',
    },
  };

  const currentTone = toneConfig[tone] || toneConfig.neutral;

  return (
    <Card
      style={{
        padding: '1.1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        {currentTone.icon && (
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: currentTone.color,
              background: currentTone.bg,
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              lineHeight: 1,
            }}
          >
            {currentTone.icon}
          </span>
        )}
      </div>

      <div
        className="num-tabular"
        style={{
          fontSize: '1.65rem',
          fontWeight: 700,
          color: currentTone.color,
          lineHeight: 1.15,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>

      {subtitle && (
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {subtitle}
        </span>
      )}
    </Card>
  );
};

export default StatCard;
