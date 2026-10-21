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

describe('SplitsPage Component - Draft Opt-In Polls (Phase 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
  });

  const mockGroup = {
    _id: 'g1',
    name: 'Goa Trip',
    isTrip: true,
    userRole: 'owner',
    canManage: true,
    members: [
      { _id: 'm1', name: 'Alice', email: 'alice@example.com', role: 'owner', status: 'active', userId: 'u1' },
      { _id: 'm2', name: 'Bob', email: 'bob@example.com', role: 'member', status: 'active', userId: 'u2' },
      { _id: 'm3', name: 'Charlie', email: 'charlie@example.com', role: 'member', status: 'active', userId: 'u3' },
    ],
    expenses: [],
    memberBalances: [
      { memberId: 'm1', name: 'Alice', balance: 0 },
      { memberId: 'm2', name: 'Bob', balance: 0 },
      { memberId: 'm3', name: 'Charlie', balance: 0 },
    ],
    simplifiedDebts: [],
  };

  const mockPollDraft = {
    _id: 'draft-p1',
    tripId: 'g1',
    cleanMerchant: 'Curlies Beach Shack',
    amount: 1500,
    category: 'Dining',
    status: 'poll_created',
    poll: {
      question: 'Did you share the expense of ₹1500 at Curlies Beach Shack?',
      paidBy: 'm1',
      options: [
        { memberId: 'm1', name: 'Alice', status: 'opted_in' },
        { memberId: 'm2', name: 'Bob', status: 'pending' },
        { memberId: 'm3', name: 'Charlie', status: 'pending' },
      ],
      closed: false,
    },
  };

  it('renders active draft poll in Captured Payment Drafts section and allows members to vote', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/splits/groups') {
        return Promise.resolve({ data: { success: true, data: [mockGroup] } });
      }
      if (url === '/splits/invites/pending') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/friends') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/splits/groups/g1/upi-drafts') {
        return Promise.resolve({ data: { success: true, data: [mockPollDraft] } });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          ...mockPollDraft,
          poll: {
            ...mockPollDraft.poll,
            options: [
              { memberId: 'm1', name: 'Alice', status: 'opted_in' },
              { memberId: 'm2', name: 'Bob', status: 'opted_in' },
              { memberId: 'm3', name: 'Charlie', status: 'pending' },
            ],
          },
        },
      },
    });

    render(<SplitsPage />);

    // Wait for group and drafts to load
    await waitFor(() => {
      expect(screen.getByText('Curlies Beach Shack')).toBeInTheDocument();
      expect(screen.getByText('POLL IN PROGRESS')).toBeInTheDocument();
      expect(screen.getByText(/Did you share the expense of ₹1500 at Curlies Beach Shack/i)).toBeInTheDocument();
    });

    // Verify member chips in poll
    expect(screen.getByText(/✓ Alice/i)).toBeInTheDocument();
    expect(screen.getByText(/⏱ Bob/i)).toBeInTheDocument();

    // Click "✓ I was part of this"
    const optInBtn = screen.getByRole('button', { name: /✓ I was part of this/i });
    fireEvent.click(optInBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/splits/groups/g1/upi-drafts/draft-p1/poll/respond',
        expect.objectContaining({ response: 'opt_in' })
      );
    });
  });

  it('allows closing the poll and splitting with integer-paise math', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/splits/groups') {
        return Promise.resolve({ data: { success: true, data: [mockGroup] } });
      }
      if (url === '/splits/invites/pending') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/friends') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/splits/groups/g1/upi-drafts') {
        return Promise.resolve({ data: { success: true, data: [mockPollDraft] } });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Poll closed',
        data: {
          group: {
            ...mockGroup,
            expenses: [{ _id: 'exp1', description: 'Curlies Beach Shack', amount: 1500, paidByName: 'Alice', splitBetweenNames: ['Alice', 'Bob'] }],
          },
        },
      },
    });

    render(<SplitsPage />);

    await waitFor(() => {
      expect(screen.getByText('Curlies Beach Shack')).toBeInTheDocument();
    });

    // Click Close & Split button
    const closeBtn = screen.getByRole('button', { name: /Close & Split/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/splits/groups/g1/upi-drafts/draft-p1/poll/close',
        expect.objectContaining({ syncPersonal: true })
      );
    });
  });

  it('renders receipt thumbnail on poll card and expense row when receiptKey is present', async () => {
    const pollWithReceipt = {
      ...mockPollDraft,
      receiptKey: 'receipts/u1/seafood-poll.jpg',
    };

    const groupWithReceiptExpense = {
      ...mockGroup,
      expenses: [
        {
          _id: 'exp-rcpt-99',
          description: 'Seafood Platter',
          amount: 1500,
          paidBy: 'm1',
          paidByName: 'Alice',
          splitBetween: ['m1', 'm2'],
          splitBetweenNames: ['Alice', 'Bob'],
          date: '2026-03-22',
          receiptKey: 'receipts/u1/seafood-platter.jpg',
        },
      ],
    };

    api.get.mockImplementation((url) => {
      if (url === '/splits/groups') {
        return Promise.resolve({ data: { success: true, data: [groupWithReceiptExpense] } });
      }
      if (url === '/splits/groups/g1/upi-drafts') {
        return Promise.resolve({ data: { success: true, data: [pollWithReceipt] } });
      }
      if (url.includes('/receipts/') && url.endsWith('/url')) {
        return Promise.resolve({
          data: {
            success: true,
            data: { url: 'https://s3.mock/receipt-img.jpg?signed=true' },
          },
        });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    render(<SplitsPage />);

    // Wait for poll card thumbnail to appear
    await waitFor(() => {
      expect(screen.getByAltText('Receipt for Curlies Beach Shack')).toBeInTheDocument();
      expect(screen.getByAltText('Receipt for Seafood Platter')).toBeInTheDocument();
    });

    // Tap thumbnail on poll card to enlarge
    const pollThumbBtns = screen.getAllByRole('button', { name: /Enlarge receipt thumbnail/i });
    fireEvent.click(pollThumbBtns[0]);

    // Verify modal is displayed with full view
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByAltText('Enlarged receipt')).toBeInTheDocument();
      expect(screen.getByText(/Receipt available for 30 days/i)).toBeInTheDocument();
    });
  });
});
