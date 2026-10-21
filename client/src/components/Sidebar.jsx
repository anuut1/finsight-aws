import { NavLink } from 'react-router-dom';

/**
 * Quiet Ledger Slim Left Navigation (200px)
 *
 * - Wordmark "FinSight" in Instrument Serif
 * - Links: Home, Transactions, Bills & subscriptions, Budgets, Goals, Splits & trips, Insights
 * - Active item is bold ink; others muted
 * - On mobile: responsive bottom bar
 */
const navItems = [
  { to: '/dashboard', label: 'Home' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/bills', label: 'Bills & subscriptions' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/goals', label: 'Goals' },
  { to: '/splits', label: 'Splits & trips' },
  { to: '/friends', label: 'Friends' },
  { to: '/analytics', label: 'Insights' },
];

const Sidebar = () => {
  return (
    <>
      {/* Desktop Slim Sidebar (200px) */}
      <aside
        className="quiet-sidebar"
        style={{
          width: '200px',
          minWidth: '200px',
          height: '100vh',
          position: 'sticky',
          top: 0,
          background: 'transparent',
          borderRight: '1px solid var(--border-color)',
          padding: '2rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          zIndex: 40,
        }}
      >
        {/* Wordmark in serif */}
        <div style={{ marginBottom: '2.5rem', paddingLeft: '0.25rem' }}>
          <NavLink
            to="/dashboard"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1.75rem',
              fontWeight: 400,
              color: 'var(--text-primary)',
              textDecoration: 'none',
              letterSpacing: '-0.02em',
            }}
          >
            FinSight
          </NavLink>
        </div>

        {/* Navigation list */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'block',
                padding: '0.35rem 0.25rem',
                fontSize: '0.92rem',
                fontFamily: 'var(--font-sans)',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none',
                transition: 'color var(--transition-fast)',
                letterSpacing: '-0.01em',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className="quiet-bottom-nav"
        style={{
          display: 'none',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '60px',
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-color)',
          zIndex: 100,
          padding: '0 0.5rem',
          alignItems: 'center',
          justifyContent: 'space-around',
        }}
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 4px',
              fontSize: '0.72rem',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: isActive ? 600 : 400,
              textDecoration: 'none',
              textAlign: 'center',
            })}
          >
            {item.label.split(' ')[0]}
          </NavLink>
        ))}
      </nav>
    </>
  );
};

export default Sidebar;
