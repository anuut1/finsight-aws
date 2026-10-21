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

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockqrdata'),
  },
}));

describe('SplitsPage Component - Settle-Up Flow (Phase 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
  });

  const mockGroupWithDebt = {
    _id: 'g1',
    name: 'Goa Holiday',
    isTrip: false,
    userRole: 'owner',
    canManage: true,
    members: [
      { _id: 'm1', name: 'Alice', email: 'alice@example.com', role: 'owner', status: 'active', userId: 'u1' },
      { _id: 'm2', name: 'Bob', email: 'bob@example.com', role: 'member', status: 'active', userId: 'u2' },
    ],
    expenses: [
      {
        _id: 'exp1',
        description: 'Beach Shack Lunch',
        amount: 800,
        paidBy: 'm1',
        paidByName: 'Alice',
        splitBetween: ['m1', 'm2'],
        splitBetweenNames: ['Alice', 'Bob'],
        date: '2026-10-17',
        syncPersonal: true,
        personalShareAmount: 400,
      },
    ],
    memberBalances: [
      { memberId: 'm1', name: 'Alice', balance: 400 },
      { memberId: 'm2', name: 'Bob', balance: -400 },
    ],
    simplifiedDebts: [
      {
        from: 'm2',
        fromName: 'Bob',
        to: 'm1',
        toName: 'Alice',
        amount: 400,
      },
    ],
  };

  const mockFullySettledGroup = {
    ...mockGroupWithDebt,
    settlements: [
      {
        from: 'm2',
        to: 'm1',
        amount: 400,
        date: '2026-10-17',
        note: 'Settled via UPI',
      },
    ],
    memberBalances: [
      { memberId: 'm1', name: 'Alice', balance: 0 },
      { memberId: 'm2', name: 'Bob', balance: 0 },
    ],
    simplifiedDebts: [],
  };

  it('renders Who Owes Whom section with Settle via UPI button and records settlement', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/splits/groups') {
        return Promise.resolve({ data: { success: true, data: [mockGroupWithDebt] } });
      }
      if (url === '/splits/invites/pending') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/friends') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/splits/groups/g1/upi-drafts') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: mockFullySettledGroup,
      },
    });

    render(<SplitsPage />);

    // Wait for group and debts to render
    await waitFor(() => {
      expect(screen.getByText('Who Owes Whom')).toBeInTheDocument();
      expect(screen.getByText(/Bob owes Alice/i)).toBeInTheDocument();
      expect(screen.getByText('₹400')).toBeInTheDocument();
    });

    // Settle via UPI button exists
    const settleUpiBtn = screen.getByRole('button', { name: /⚡ Settle via UPI/i });
    expect(settleUpiBtn).toBeInTheDocument();

    // Click Settle via UPI to open UpiSettlementModal
    fireEvent.click(settleUpiBtn);

    await waitFor(() => {
      expect(screen.getByText('Settle with UPI')).toBeInTheDocument();
      expect(screen.getByText(/Paying to/i)).toBeInTheDocument();
    });

    // Click Record as Settled
    const recordBtn = screen.getByRole('button', { name: /✓ Record as Settled/i });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/splits/groups/g1/settlements',
        expect.objectContaining({
          from: 'm2',
          to: 'm1',
          amount: 400,
        })
      );
    });

    // After settlement, verifies "Everyone is completely settled!" displays
    await waitFor(() => {
      expect(screen.getByText(/✓ Everyone is completely settled!/i)).toBeInTheDocument();
    });
  });
});
