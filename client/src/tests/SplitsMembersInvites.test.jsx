import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SplitsPage from '../pages/SplitsPage.jsx';
import api from '../api/axios.js';

vi.mock('../api/axios.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth.js', () => ({
  default: () => ({
    user: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
  }),
}));

vi.mock('../components/TripModeWidget.jsx', () => ({
  default: () => <div data-testid="trip-mode-widget">Trip Mode Widget</div>,
}));

vi.mock('../components/UpiSettlementModal.jsx', () => ({
  default: () => null,
}));

describe('SplitsPage Component - Members & Invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pending group invites banner and allows accepting an invite', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/splits/groups') {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                _id: 'g1',
                name: 'Goa Holiday',
                isTrip: false,
                userRole: 'owner',
                canManage: true,
                members: [
                  { _id: 'm1', name: 'Alice', email: 'alice@example.com', role: 'owner', status: 'active' },
                  { _id: 'm2', name: 'Bob', email: 'bob@example.com', role: 'member', status: 'active' },
                ],
                expenses: [],
                memberBalances: [
                  { memberId: 'm1', name: 'Alice', balance: 0 },
                  { memberId: 'm2', name: 'Bob', balance: 0 },
                ],
                simplifiedDebts: [],
              },
            ],
          },
        });
      }
      if (url === '/splits/invites/pending') {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                inviteId: 'inv-123',
                groupName: 'Manali Expedition',
                invitedBy: { name: 'Charlie', email: 'charlie@example.com' },
              },
            ],
          },
        });
      }
      if (url === '/friends') {
        return Promise.resolve({
          data: {
            success: true,
            data: [{ userId: 'u2', name: 'Bob', email: 'bob@example.com' }],
          },
        });
      }
      return Promise.reject(new Error(`Unhandled GET: ${url}`));
    });

    api.post.mockResolvedValueOnce({ data: { success: true } });

    render(<SplitsPage />);

    // Check that pending invites banner is displayed
    await waitFor(() => {
      expect(screen.getByText(/Group Invitations \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText('Manali Expedition')).toBeInTheDocument();
    });

    const acceptBtn = screen.getByRole('button', { name: /accept/i });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/splits/invites/inv-123/accept');
    });
  });

  it('renders group members panel with role and allows owner to open invite modal', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/splits/groups') {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                _id: 'g1',
                name: 'Weekend Trip',
                isTrip: true,
                userRole: 'owner',
                canManage: true,
                members: [
                  { _id: 'm1', name: 'Alice', email: 'alice@example.com', role: 'owner', status: 'active' },
                  { _id: 'm2', name: 'Bob', email: 'bob@example.com', role: 'member', status: 'active' },
                ],
                expenses: [],
                memberBalances: [],
                simplifiedDebts: [],
              },
            ],
          },
        });
      }
      if (url === '/splits/invites/pending') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/friends') {
        return Promise.resolve({
          data: {
            success: true,
            data: [{ userId: 'u3', name: 'Diana', email: 'diana@example.com' }],
          },
        });
      }
      return Promise.reject(new Error(`Unhandled GET: ${url}`));
    });

    render(<SplitsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Weekend Trip').length).toBeGreaterThan(0);
      expect(screen.getByText('Group Members')).toBeInTheDocument();
    });

    // Alice is owner, Bob is member
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);

    // Owner can open Invite modal
    const inviteBtns = screen.getAllByRole('button', { name: /\+ Invite/i });
    fireEvent.click(inviteBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Invite to Weekend Trip/i)).toBeInTheDocument();
      expect(screen.getByText(/Invite from your friends:/i)).toBeInTheDocument();
      expect(screen.getByText(/\+ Invite Diana/i)).toBeInTheDocument();
    });
  });
});
