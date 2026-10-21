import { useState } from 'react';
import useAuth from '../hooks/useAuth';
import ThemeToggle from './ThemeToggle.jsx';
import Button from './Button.jsx';
import DatabaseActivityModal from './DatabaseActivityModal.jsx';

/**
 * Quiet Ledger Top Bar
 *
 * Airy, minimal top bar showing theme toggle, user info, and sign out button.
 * Transparent ground, no heavy cards or gradient washes.
 */
const Navbar = () => {
  const { user, logout } = useAuth();
  const [dbModalOpen, setDbModalOpen] = useState(false);

  return (
    <>
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
              <button
                type="button"
                onClick={() => setDbModalOpen(true)}
                title="View DynamoDB entries, account details, and all activity"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: '20px',
                  color: '#818CF8',
                  padding: '4px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>⚡</span>
                <span>DynamoDB Activity</span>
              </button>
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

      <DatabaseActivityModal
        isOpen={dbModalOpen}
        onClose={() => setDbModalOpen(false)}
      />
    </>
  );
};

export default Navbar;
