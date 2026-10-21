import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuthContext } from '../context/AuthContext.jsx';
import api from '../api/axios.js';

vi.mock('../api/axios.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

const TestConsumer = () => {
  const { user, token, loading, logout } = useAuthContext();
  if (loading) return <div>Loading auth...</div>;
  return (
    <div>
      <div data-testid="auth-status">{token ? 'logged-in' : 'logged-out'}</div>
      {user && <div data-testid="user-email">{user.email}</div>}
      <button onClick={logout}>Log out</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders logged out state when no token in localStorage', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('logged-out');
    });
  });

  it('fetches /auth/me and populates user when token is in localStorage', async () => {
    localStorage.setItem('finsight_token', 'valid_test_token_123');
    api.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: { _id: 'u1', email: 'user@example.com', name: 'User One' },
      },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('logged-in');
      expect(screen.getByTestId('user-email')).toHaveTextContent('user@example.com');
    });
  });

  it('clears session on logout', async () => {
    localStorage.setItem('finsight_token', 'token_to_remove');
    api.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: { _id: 'u1', email: 'user@example.com' },
      },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('logged-in');
    });

    const logoutBtn = screen.getByRole('button', { name: /log out/i });
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('logged-out');
      expect(localStorage.getItem('finsight_token')).toBeNull();
    });
  });
});
