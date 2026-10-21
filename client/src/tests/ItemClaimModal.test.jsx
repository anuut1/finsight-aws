import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ItemClaimModal from '../components/ItemClaimModal.jsx';
import api from '../api/axios.js';

vi.mock('../api/axios.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth.js', () => ({
  default: () => ({
    user: { id: 'u1', name: 'Alice' },
  }),
}));

describe('ItemClaimModal Component', () => {
  const mockTrip = {
    _id: 'trip123',
    name: 'Goa Holiday',
    userRole: 'owner',
    canManage: true,
    currency: 'INR',
    members: [
      { _id: 'm1', userId: 'u1', name: 'Alice' },
      { _id: 'm2', userId: 'u2', name: 'Bob' },
    ],
  };

  const mockBill = {
    _id: 'bill123',
    groupId: 'trip123',
    title: 'Seafood Dinner',
    paidBy: 'm1',
    createdBy: 'u1',
    total: 1000,
    tax: 100,
    serviceCharge: 0,
    discount: 0,
    status: 'claiming',
    items: [
      {
        _id: 'item1',
        name: 'Fish Curry',
        qty: 1,
        price: 500,
        claims: [{ memberId: 'm1', userId: 'u1', units: 1 }],
      },
      {
        _id: 'item2',
        name: 'Prawn Fry',
        qty: 1,
        price: 400,
        claims: [],
      },
    ],
  };

  const mockBreakdown = {
    total: 1000,
    itemsTotal: 900,
    tax: 100,
    unclaimedTotal: 400,
    shares: {
      m1: {
        memberId: 'm1',
        name: 'Alice',
        itemsSubtotal: 500,
        unclaimedShare: 200,
        taxShare: 78,
        total: 778,
      },
    },
  };

  const mockMyShare = {
    itemsSubtotal: 500,
    unclaimedShare: 200,
    taxShare: 78,
    serviceChargeShare: 0,
    discountShare: 0,
    total: 778,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches bill data on open, displays items, and renders running share', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          bill: mockBill,
          breakdown: mockBreakdown,
          myShare: mockMyShare,
        },
      },
    });

    render(
      <ItemClaimModal
        isOpen={true}
        onClose={vi.fn()}
        trip={mockTrip}
        billId="bill123"
        onBillFinalized={vi.fn()}
      />
    );

    // Initial loading indicator
    expect(screen.getByText(/Loading bill details…/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Seafood Dinner')).toBeInTheDocument();
      expect(screen.getByText(/CLAIMING IN PROGRESS/i)).toBeInTheDocument();
      expect(screen.getByText('Fish Curry')).toBeInTheDocument();
      expect(screen.getByText('Prawn Fry')).toBeInTheDocument();
      // Running share
      expect(screen.getByText('₹778.00')).toBeInTheDocument();
    });
  });

  it('allows claiming an unclaimed item and updates state from response', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          bill: mockBill,
          breakdown: mockBreakdown,
          myShare: mockMyShare,
        },
      },
    });

    const updatedBill = {
      ...mockBill,
      items: [
        mockBill.items[0],
        {
          ...mockBill.items[1],
          claims: [{ memberId: 'm1', userId: 'u1', units: 1 }],
        },
      ],
    };

    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          bill: updatedBill,
          breakdown: { ...mockBreakdown, unclaimedTotal: 0 },
          myShare: { ...mockMyShare, itemsSubtotal: 900, total: 1000 },
        },
      },
    });

    render(
      <ItemClaimModal
        isOpen={true}
        onClose={vi.fn()}
        trip={mockTrip}
        billId="bill123"
        onBillFinalized={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Prawn Fry')).toBeInTheDocument();
    });

    // Tap "Claim" on Prawn Fry
    const claimButtons = screen.getAllByRole('button', { name: /Claim/i });
    const claimPrawnBtn = claimButtons.find((btn) => btn.getAttribute('aria-label') === 'Claim Prawn Fry');
    expect(claimPrawnBtn).toBeTruthy();
    fireEvent.click(claimPrawnBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/splits/groups/trip123/bills/bill123/claim',
        expect.objectContaining({
          itemId: 'item2',
          units: 1,
        })
      );
    });
  });

  it('allows host to finalize bill into trip expense', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          bill: mockBill,
          breakdown: mockBreakdown,
          myShare: mockMyShare,
        },
      },
    });

    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          bill: { ...mockBill, status: 'finalized' },
          expense: { _id: 'exp123', description: 'Seafood Dinner', amount: 1000 },
        },
      },
    });

    const handleFinalized = vi.fn();

    render(
      <ItemClaimModal
        isOpen={true}
        onClose={vi.fn()}
        trip={mockTrip}
        billId="bill123"
        onBillFinalized={handleFinalized}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Host Controls/i)).toBeInTheDocument();
    });

    // Click Finalize
    fireEvent.click(screen.getByRole('button', { name: /Finalize & Add Group Expense/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/splits/groups/trip123/bills/bill123/finalize',
        expect.objectContaining({
          unclaimedPolicy: 'split_equally',
        })
      );
      expect(handleFinalized).toHaveBeenCalled();
    });
  });
});
