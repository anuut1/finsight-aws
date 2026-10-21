import Card from './Card.jsx';

/**
 * InsightCard
 *
 * Plain-language financial takeaway (e.g. "Food is up 32% vs last month").
 * Highlights one actionable observation in clean, calm fintech language.
 */
const InsightCard = ({
  title = 'Food & Dining is up 32% vs last month',
  detail = 'You have spent ₹8,420 on dining out this month compared to ₹6,380 at this point last month.',
  trend = 'up', // 'up' (spending up), 'down' (spending down), or 'positive'
  category = 'Food & Dining',
  className = '',
  style = {},
}) => {
  const trendConfig = {
    up: {
      color: 'var(--color-negative)',
      bg: 'var(--color-negative-bg)',
      icon: '↗',
      label: 'Spending higher',
    },
    down: {
      color: 'var(--color-positive)',
      bg: 'var(--color-positive-bg)',
      icon: '↘',
      label: 'Spending lower',
    },
    positive: {
      color: 'var(--color-positive)',
      bg: 'var(--color-positive-bg)',
      icon: '★',
      label: 'Savings milestone',
    },
  };

  const currentTrend = trendConfig[trend] || trendConfig.up;

  return (
    <Card
      style={{
        padding: '1.25rem 1.4rem',
        border: '1px solid var(--border-color)',
        ...style,
      }}
      className={`insight-card ${className}`}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.65rem',
        }}
      >
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
          }}
        >
          Ledger Insight
        </span>

        <span
          style={{
            fontSize: '0.74rem',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            background: currentTrend.bg,
            color: currentTrend.color,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>{currentTrend.icon}</span>
          <span>{currentTrend.label}</span>
        </span>
      </div>

      <h3
        style={{
          margin: '0 0 0.4rem 0',
          fontSize: '1.1rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1.3,
        }}
      >
        {title}
      </h3>

      <p
        style={{
          margin: 0,
          fontSize: '0.86rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}
      >
        {detail}
      </p>

      {category && (
        <div style={{ marginTop: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              background: 'var(--bg-surface-elevated)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-color)',
            }}
          >
            #{category.toLowerCase().replace(/\s+/g, '-')}
          </span>
        </div>
      )}
    </Card>
  );
};

export default InsightCard;
