import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import useAuth from '../hooks/useAuth';
import Input from '../components/Input';
import Button from '../components/Button';
import ThemeToggle from '../components/ThemeToggle';
import '../styles/login.css';

/**
 * Quiet Ledger Login Page (/login)
 *
 * - Single centered column, max-width 380px, on plain ground
 * - Wordmark "FinSight" in serif top-left
 * - Headline "Welcome back." (serif, ~52px), one muted line beneath
 * - Fields: Email, Password (52px tall, visible 2px ink focus ring)
 * - Buttons: primary "Log in" (pill), secondary "Continue with Google" (outline pill, text only)
 * - Footer: "New to FinSight? Create an account"
 * - Inline error in warning color, no popups, no marketing copy
 */
const LoginPage = () => {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [resetForm, setResetForm] = useState({ email: '', newPassword: '' });
  const [isResetMode, setIsResetMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (token) {
      navigate('/dashboard', { replace: true });
    }
  }, [token, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (isResetMode) {
      setResetForm((prev) => ({ ...prev, [name]: value }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isResetMode) {
      const cleanEmail = resetForm.email.trim().toLowerCase();
      if (!cleanEmail || !resetForm.newPassword) {
        setError('Please enter your email and new password.');
        return;
      }
      if (resetForm.newPassword.length < 6) {
        setError('New password must be at least 6 characters.');
        return;
      }

      setLoading(true);
      setError('');
      setSuccessMsg('');
      try {
        const res = await api.post('/auth/reset-password', {
          email: cleanEmail,
          newPassword: resetForm.newPassword,
        });
        if (res.data?.success) {
          setSuccessMsg(res.data.message || 'Password reset successfully!');
          login(res.data.data.token, res.data.data.user);
          setTimeout(() => {
            navigate('/dashboard');
          }, 800);
        }
      } catch (err) {
        const serverMessage = err.response?.data?.message;
        if (serverMessage) {
          setError(serverMessage);
        } else if (!err.response || err.code === 'ERR_NETWORK') {
          setError('Unable to connect to the FinSight server. Please ensure the backend is running.');
        } else {
          setError('Could not reset password. Please check your email.');
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    const cleanEmail = form.email.trim().toLowerCase();
    if (!cleanEmail || !form.password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', {
        email: cleanEmail,
        password: form.password,
      });
      if (res.data?.success) {
        login(res.data.data.token, res.data.data.user);
        navigate('/dashboard');
      }
    } catch (err) {
      const serverMessage = err.response?.data?.message;
      if (serverMessage) {
        setError(serverMessage);
      } else if (!err.response || err.code === 'ERR_NETWORK') {
        setError('Unable to connect to the FinSight server. Please ensure the backend is running.');
      } else {
        setError('Invalid email or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <Link to="/" className="auth-wordmark" aria-label="FinSight Home">
          FinSight
        </Link>
        <ThemeToggle />
      </header>

      <main className="auth-container">
        <h1 className="auth-headline">
          {isResetMode ? 'Reset password.' : 'Welcome back.'}
        </h1>
        <p className="auth-subhead">
          {isResetMode
            ? 'Set a new password to regain access to your ledger.'
            : "Log in to see what's safe to spend."}
        </p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {!isResetMode ? (
            <>
              <Input
                label="Email"
                id="login-email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={loading}
              />

              <Input
                label="Password"
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={loading}
                rightAction={
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                }
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.5rem' }}>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                  }}
                  onClick={() => {
                    setError('');
                    setSuccessMsg('');
                    setResetForm((prev) => ({ ...prev, email: form.email }));
                    setIsResetMode(true);
                  }}
                >
                  Forgot password?
                </button>
              </div>
            </>
          ) : (
            <>
              <Input
                label="Account Email"
                id="reset-email"
                name="email"
                type="email"
                value={resetForm.email}
                onChange={handleChange}
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={loading}
              />

              <Input
                label="New Password"
                id="reset-password"
                name="newPassword"
                type={showPassword ? 'text' : 'password'}
                value={resetForm.newPassword}
                onChange={handleChange}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                required
                disabled={loading}
                rightAction={
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                }
              />
            </>
          )}

          {error && (
            <div role="alert" className="auth-inline-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
              {error === 'Invalid credentials' && !isResetMode && (
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '0 0 0 4px',
                    color: 'var(--color-warning)',
                    fontWeight: 600,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setError('');
                    setResetForm((prev) => ({ ...prev, email: form.email }));
                    setIsResetMode(true);
                  }}
                >
                  Reset password?
                </button>
              )}
            </div>
          )}

          {successMsg && (
            <div role="status" style={{ color: 'var(--color-positive)', fontSize: '0.85rem', fontWeight: 500 }}>
              {successMsg}
            </div>
          )}

          <div className="auth-actions">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
            >
              {isResetMode ? 'Update password & log in' : 'Log in'}
            </Button>

            {isResetMode ? (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                fullWidth
                disabled={loading}
                onClick={() => {
                  setError('');
                  setSuccessMsg('');
                  setIsResetMode(false);
                }}
              >
                Back to log in
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                fullWidth
                disabled={loading}
                onClick={() => {
                  setError('Google sign-in is not yet configured.');
                }}
              >
                Continue with Google
              </Button>
            )}
          </div>
        </form>

        <p className="auth-footer">
          {isResetMode ? (
            <>
              Remember your password?{' '}
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setError('');
                  setSuccessMsg('');
                  setIsResetMode(false);
                }}
              >
                Log in
              </button>
            </>
          ) : (
            <>
              New to FinSight?{' '}
              <Link to="/register">
                Create an account
              </Link>
            </>
          )}
        </p>
      </main>
    </div>
  );
};

export default LoginPage;
