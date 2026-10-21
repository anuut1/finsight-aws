import useAuth from '../hooks/useAuth';
import ThemeToggle from './ThemeToggle.jsx';
import Button from './Button.jsx';

/**
 * Quiet Ledger Top Bar
 *
 * Airy, minimal top bar showing theme toggle, user info, and sign out button.
 * Transparent ground, no heavy cards or gradient washes.
 */
const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '1.25rem 2rem 0.5rem 2rem',
        background: 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <ThemeToggle />
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {user.name || user.email}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={logout}
            >
              Sign out
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
