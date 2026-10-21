import { Link } from 'react-router-dom';
import Card from './Card.jsx';
import ProgressBar from './ProgressBar.jsx';

/**
 * Budgets & Goals Card for Quiet Ledger
 *
 * Displays top active budgets and top goal with thin progress bars,
 * hairline rows, and tabular figures.
 */
const BudgetsAndGoalsCard = ({ budgets = [], goals = [], loading = false }) => {
  const topBudgets = Array.isArray(budgets) && budgets.length > 0
    ? budgets.slice(0, 3)
    : [];

  const topGoal = Array.isArray(goals) && goals.length > 0
    ? goals[0]
    : null;

  return (
    <Card style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '1.25rem',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              display: 'block',
              marginBottom: '2px',
            }}
          >
            Planning
          </span>
          <h3
            style={{
              margin: 0,
              fontFamily: 'var(--font-heading, "Instrument Serif", serif)',
              fontSize: '1.35rem',
              fontWeight: 400,
              color: 'var(--text-primary)',
            }}
          >
            Budgets & goals
          </h3>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem' }}>
          <Link
            to="/budgets"
            style={{
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            Budgets &rarr;
          </Link>
          <Link
            to="/goals"
            style={{
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            Goals &rarr;
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Loading budgets & goals...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top Budgets */}
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Top budgets
            </div>

            {topBudgets.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                No budgets set yet.{' '}
                <Link to="/budgets" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>
                  Create one
                </Link>
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {topBudgets.map((b) => {
                  const limit = Number(b.limit) || 0;
                  const spent = Number(b.spent) || 0;
                  const percent = limit > 0 ? (spent / limit) * 100 : 0;
                  const isOver = percent >= 100;
                  const isWarning = percent > 85 && !isOver;

                  return (
                    <div key={b._id || b.category}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          fontSize: '0.85rem',
                          marginBottom: '0.35rem',
                        }}
                      >
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {b.category}
                        </span>
                        <span
                          className="num-tabular"
                          style={{
                            color: isOver
                              ? 'var(--color-warning)'
                              : isWarning
                              ? 'var(--color-warning)'
                              : 'var(--text-muted)',
                            fontWeight: isOver ? 600 : 400,
                          }}
                        >
                          ₹{spent.toLocaleString('en-IN')} / ₹{limit.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <ProgressBar
                        value={percent}
                        tone={isOver ? 'negative' : isWarning ? 'warning' : 'primary'}
                        height={4}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Hairline Divider */}
          <div style={{ height: '1px', background: 'var(--border-color)' }} />

          {/* Top Goal */}
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Top goal
            </div>

            {!topGoal ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                No active savings goals.{' '}
                <Link to="/goals" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>
                  Set a goal
                </Link>
              </p>
            ) : (
              <div>
                {(() => {
                  const target = Number(topGoal.targetAmount) || 0;
                  const saved = Number(topGoal.savedAmount) || 0;
                  const percent = target > 0 ? (saved / target) * 100 : 0;

                  return (
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          fontSize: '0.85rem',
                          marginBottom: '0.35rem',
                        }}
                      >
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {topGoal.title}
                        </span>
                        <span className="num-tabular" style={{ color: 'var(--text-muted)' }}>
                          ₹{saved.toLocaleString('en-IN')} / ₹{target.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <ProgressBar value={percent} tone="positive" height={4} />
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                          color: 'var(--color-positive)',
                          marginTop: '0.35rem',
                        }}
                      >
                        <span>{Math.round(percent)}% funded</span>
                        {topGoal.targetDate && (
                          <span style={{ color: 'var(--text-muted)' }}>
                            Target: {new Date(topGoal.targetDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export default BudgetsAndGoalsCard;
