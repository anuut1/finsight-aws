import Card from './Card.jsx';
import AnimatedNumber from './AnimatedNumber.jsx';
import Skeleton from './Skeleton.jsx';
import Button from './Button.jsx';

/**
 * Quiet Ledger Hero: Safe to Spend
 *
 * - Label: "Safe to spend"
 * - ~104px serif number (Instrument Serif)
 * - One muted line: "About ₹680 a day for the next 21 days, after bills, budgets and goals."
 * - Thin month-progress bar under it
 * - Top right: pill button "+ Add expense"
 */
const HeroSafeToSpend = ({
  income = 0,
  spent = 0,
  upcomingBills = 0,
  budgetTotal = 0,
  goalContributions = 0,
  loading = false,
  onAddExpense,
  className = '',
  style = {},
}) => {
  const now = new Date();
  const currentDay = now.getDate();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(1, totalDays - currentDay + 1);
  const elapsedPercent = Math.min(100, Math.round((currentDay / totalDays) * 100));

  // Safe to spend calculation:
  // (Total income) - (spent so far) - (reserved upcoming bills) - (reserved goal savings)
  const totalReserved = upcomingBills + goalContributions;
  const netAvailable = income > 0 ? income - spent - totalReserved : Math.max(0, budgetTotal - spent);
  const safeToSpend = Math.max(0, netAvailable);
  const dailyBurnRate = Math.floor(safeToSpend / daysRemaining);

  if (loading) {
    return (
      <Card style={{ padding: '2rem 2.25rem', ...style }} className={className}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <Skeleton width="110px" height="1rem" />
          <Skeleton width="130px" height="42px" borderRadius="999px" />
        </div>
        <Skeleton width="320px" height="5.5rem" style={{ marginBottom: '1rem' }} />
        <Skeleton width="420px" height="1.2rem" style={{ marginBottom: '1.5rem' }} />
        <Skeleton width="100%" height="4px" borderRadius="999px" />
      </Card>
    );
  }

  return (
    <Card
      style={{
        padding: '2.25rem 2.5rem',
        ...style,
      }}
      className={`hero-safe-to-spend ${className}`}
    >
      {/* Top Header: Label + Add Expense pill button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <span
          style={{
            fontSize: '0.88rem',
            color: 'var(--text-secondary)',
            fontWeight: 500,
            letterSpacing: '-0.01em',
          }}
        >
          Safe to spend
        </span>

        {onAddExpense && (
          <Button
            variant="primary"
            size="md"
            onClick={onAddExpense}
            aria-label="Add expense"
          >
            + Add expense
          </Button>
        )}
      </div>

      {/* Hero Number (~104px serif) */}
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'clamp(3.5rem, 8vw, 104px)',
          fontWeight: 400,
          color: 'var(--text-primary)',
          lineHeight: 1.02,
          letterSpacing: '-0.03em',
          margin: '0.25rem 0 0.75rem 0',
        }}
      >
        <AnimatedNumber value={safeToSpend} prefix="₹" />
      </div>

      {/* Muted line beneath */}
      <p
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.96rem',
          lineHeight: 1.5,
          margin: '0 0 1.5rem 0',
        }}
      >
        About{' '}
        <span className="num-tabular" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          ₹{dailyBurnRate.toLocaleString('en-IN')}
        </span>{' '}
        a day for the next {daysRemaining} days, after bills, budgets and goals.
      </p>

      {/* Thin month-progress bar under it */}
      <div
        role="progressbar"
        aria-label="Month progress"
        aria-valuenow={elapsedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          width: '100%',
          height: '3px',
          background: 'var(--track-bg, #E8E8E4)',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${elapsedPercent}%`,
            background: 'var(--color-ink)',
            borderRadius: '999px',
            transition: 'width 300ms ease',
          }}
        />
      </div>
    </Card>
  );
};

export default HeroSafeToSpend;
