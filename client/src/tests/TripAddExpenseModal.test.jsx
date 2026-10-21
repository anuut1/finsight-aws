import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TripAddExpenseModal from '../components/TripAddExpenseModal.jsx';
import api from '../api/axios.js';

vi.mock('../api/axios.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

window.URL.createObjectURL = vi.fn(() => 'blob:mock-receipt-preview');
window.URL.revokeObjectURL = vi.fn();

describe('TripAddExpenseModal Component', () => {
  const mockTrip = {
    _id: 'trip123',
    name: 'Goa Holiday',
    members: [
      { _id: 'm1', name: 'Alice' },
      { _id: 'm2', name: 'Bob' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with trip members when isOpen is true', () => {
    render(
      <TripAddExpenseModal
        isOpen={true}
        onClose={vi.fn()}
        trip={mockTrip}
        onAdded={vi.fn()}
      />
    );

    expect(screen.getByText('Add trip expense')).toBeInTheDocument();
    expect(screen.getByLabelText(/What was it for/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('has segmented control with By items disabled initially until items exist', () => {
    render(
      <TripAddExpenseModal
        isOpen={true}
        onClose={vi.fn()}
        trip={mockTrip}
        onAdded={vi.fn()}
      />
    );

    const byItemsBtn = screen.getByRole('button', { name: /By items/i });
    expect(byItemsBtn).toBeDisabled();
  });

  it('renders receipt attachment buttons and lifecycle notice', () => {
    render(
      <TripAddExpenseModal
        isOpen={true}
        onClose={vi.fn()}
        trip={mockTrip}
        onAdded={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Take photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload image/i })).toBeInTheDocument();
    expect(screen.getByText(/Receipt available for 30 days/i)).toBeInTheDocument();
  });

  it('calculates and displays per-person equal share preview', () => {
    render(
      <TripAddExpenseModal
        isOpen={true}
        onClose={vi.fn()}
        trip={mockTrip}
        onAdded={vi.fn()}
      />
    );

    const amountInput = screen.getByLabelText(/Amount/i);
    fireEvent.change(amountInput, { target: { value: '800' } });

    // 800 divided by 2 members = 400 each
    expect(screen.getByText(/₹400 each, split equally/i)).toBeInTheDocument();
  });

  it('submits trip expense to API and invokes onAdded callback', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: { _id: 'exp1', description: 'Dinner', amount: 800 },
      },
    });

    const handleAdded = vi.fn();
    const handleClose = vi.fn();

    render(
      <TripAddExpenseModal
        isOpen={true}
        onClose={handleClose}
        trip={mockTrip}
        onAdded={handleAdded}
      />
    );

    fireEvent.change(screen.getByLabelText(/What was it for/i), { target: { value: 'Dinner' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '800' } });

    fireEvent.click(screen.getByRole('button', { name: /Add expense/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/splits/groups/trip123/expenses',
        expect.objectContaining({
          description: 'Dinner',
          amount: 800,
          paidBy: 'm1',
          splitBetween: ['m1', 'm2'],
        })
      );
      expect(handleAdded).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('scans receipt, prefills fields, enables By items, shows summary, and submits with receiptKey', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/receipts/upload-url') {
        return Promise.reject(new Error('S3 direct upload unavailable in test'));
      }
      if (url === '/transactions/receipt/scan') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              merchant: 'Fisherman Wharf',
              vendor: 'Fisherman Wharf',
              date: '2026-03-24',
              total: 1250,
              subtotal: 1100,
              tax: 150,
              items: [
                { name: 'Prawn Curry', quantity: 2, price: 800 },
                { name: 'Rice', quantity: 1, price: 300 },
              ],
              s3Key: 'receipts/usr1/trip-rcpt-1.jpg',
            },
          },
        });
      }
      if (url === '/splits/groups/trip123/expenses') {
        return Promise.resolve({
          data: {
            success: true,
            data: { _id: 'exp_rcpt_1', amount: 1250, receiptKey: 'receipts/usr1/trip-rcpt-1.jpg' },
          },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    const handleAdded = vi.fn();
    const handleClose = vi.fn();

    render(
      <TripAddExpenseModal
        isOpen={true}
        onClose={handleClose}
        trip={mockTrip}
        onAdded={handleAdded}
      />
    );

    const file = new File(['mock content'], 'dinner-bill.jpg', { type: 'image/jpeg' });
    const fileInput = screen.getByLabelText(/Upload receipt image/i);

    fireEvent.change(fileInput, { target: { files: [file] } });

    // Wait for OCR prefill and summary
    await waitFor(() => {
      expect(screen.getByDisplayValue('Fisherman Wharf')).toBeInTheDocument();
      expect(screen.getByDisplayValue('1250')).toBeInTheDocument();
      expect(screen.getByDisplayValue('2026-03-24')).toBeInTheDocument();
      expect(screen.getByText(/2 items found · tax ₹150 · total ₹1250/i)).toBeInTheDocument();
    });

    // "By items" should now be enabled
    const byItemsBtn = screen.getByRole('button', { name: /By items/i });
    expect(byItemsBtn).not.toBeDisabled();

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Add expense/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/splits/groups/trip123/expenses',
        expect.objectContaining({
          description: 'Fisherman Wharf',
          amount: 1250,
          receiptKey: 'receipts/usr1/trip-rcpt-1.jpg',
        })
      );
      expect(handleAdded).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('displays Check totals warning when OCR line items do not sum up to total', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/receipts/upload-url') {
        return Promise.reject(new Error('S3 direct upload unavailable in test'));
      }
      if (url === '/transactions/receipt/scan') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              merchant: 'Bakery',
              total: 500,
              subtotal: 300,
              tax: 50, // 300 + 50 = 350 != 500 (mismatch)
              mismatch: true,
              items: [{ name: 'Cake', price: 300 }],
            },
          },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    render(
      <TripAddExpenseModal
        isOpen={true}
        onClose={vi.fn()}
        trip={mockTrip}
        onAdded={vi.fn()}
      />
    );

    const file = new File(['mock content'], 'cake.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText(/Upload receipt image/i), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Check totals/i)).toBeInTheDocument();
    });
  });

  it('gracefully degrades on scan failure without blocking manual expense submission', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/receipts/upload-url') {
        return Promise.reject(new Error('S3 error'));
      }
      if (url === '/transactions/receipt/scan') {
        return Promise.reject(new Error('OCR engine unavailable'));
      }
      if (url === '/splits/groups/trip123/expenses') {
        return Promise.resolve({
          data: { success: true, data: { _id: 'exp_manual_1' } },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    const handleAdded = vi.fn();
    render(
      <TripAddExpenseModal
        isOpen={true}
        onClose={vi.fn()}
        trip={mockTrip}
        onAdded={handleAdded}
      />
    );

    const file = new File(['mock content'], 'blurry-receipt.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText(/Upload receipt image/i), { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(/Couldn't read the receipt. You can still attach it and enter the amount yourself./i)
      ).toBeInTheDocument();
    });

    // Image thumbnail remains attached and Remove button is present
    expect(screen.getByAltText('Receipt thumbnail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove receipt/i })).toBeInTheDocument();

    // User can manually fill description & amount and submit without issue
    fireEvent.change(screen.getByLabelText(/What was it for/i), { target: { value: 'Manual Dinner' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '750' } });

    fireEvent.click(screen.getByRole('button', { name: /Add expense/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/splits/groups/trip123/expenses',
        expect.objectContaining({
          description: 'Manual Dinner',
          amount: 750,
        })
      );
      expect(handleAdded).toHaveBeenCalled();
    });
  });

  it('allows removing receipt which resets thumbnail, summary, and disables By items', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/receipts/upload-url') {
        return Promise.reject(new Error('S3 error'));
      }
      if (url === '/transactions/receipt/scan') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              merchant: 'Cafe',
              total: 200,
              items: [{ name: 'Tea', price: 200 }],
            },
          },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    render(
      <TripAddExpenseModal
        isOpen={true}
        onClose={vi.fn()}
        trip={mockTrip}
        onAdded={vi.fn()}
      />
    );

    const file = new File(['mock content'], 'tea.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText(/Upload receipt image/i), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /By items/i })).not.toBeDisabled();
    });

    // Click Remove receipt
    fireEvent.click(screen.getByRole('button', { name: /Remove receipt/i }));

    // Buttons reappear, thumbnail gone, "By items" disabled again
    expect(screen.getByRole('button', { name: /Take photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload image/i })).toBeInTheDocument();
    expect(screen.queryByAltText('Receipt thumbnail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /By items/i })).toBeDisabled();
  });

  it('supports Ask everyone (Poll) mode with attached receiptKey', async () => {
    api.post
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: { _id: 'draft123', amount: 900, cleanMerchant: 'Beach Shack' },
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Poll created for UPI draft',
        },
      });

    const handleAdded = vi.fn();
    const handleClose = vi.fn();

    render(
      <TripAddExpenseModal
        isOpen={true}
        onClose={handleClose}
        trip={mockTrip}
        onAdded={handleAdded}
      />
    );

    // Switch to Poll mode
    fireEvent.click(screen.getByRole('button', { name: /Ask everyone \(Poll\)/i }));

    expect(screen.getByText(/Opt-in Poll Mode/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/What was it for/i), { target: { value: 'Beach Shack' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '900' } });

    fireEvent.click(screen.getByRole('button', { name: /Start Poll/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/splits/groups/trip123/upi-drafts',
        expect.objectContaining({
          amount: 900,
          merchant: 'Beach Shack',
        })
      );
      expect(api.post).toHaveBeenCalledWith(
        '/splits/groups/trip123/upi-drafts/draft123/assign',
        expect.objectContaining({
          mode: 'poll',
          paidBy: 'm1',
        })
      );
      expect(handleAdded).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('allows adding manual items, shows host review table with live total check, and publishes bill', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: { _id: 'bill123', title: 'Pizza Dinner', total: 600, status: 'claiming' },
      },
    });

    const handleAdded = vi.fn();
    const handleClose = vi.fn();

    render(
      <TripAddExpenseModal
        isOpen={true}
        onClose={handleClose}
        trip={mockTrip}
        onAdded={handleAdded}
      />
    );

    // Click "+ Add items manually"
    fireEvent.click(screen.getByRole('button', { name: /Add items manually/i }));

    // Segment should switch to By items
    expect(screen.getByRole('button', { name: /By items/i })).not.toBeDisabled();
    expect(screen.getByText(/Host Review: Line items/i)).toBeInTheDocument();

    // Fill in item row
    fireEvent.change(screen.getByLabelText(/What was it for/i), { target: { value: 'Pizza Dinner' } });
    fireEvent.change(screen.getByLabelText(/Item 1 name/i), { target: { value: 'Margherita Pizza' } });
    fireEvent.change(screen.getByLabelText(/Item 1 price/i), { target: { value: '550' } });

    // Set Tax
    fireEvent.change(screen.getByLabelText(/Tax/i), { target: { value: '50' } });

    // Live total check: 550 + 50 = 600. Update Amount field
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '600' } });
    expect(screen.getByText(/Totals match perfectly/i)).toBeInTheDocument();

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Publish bill for claiming/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/splits/groups/trip123/bills',
        expect.objectContaining({
          title: 'Pizza Dinner',
          total: 600,
          tax: 50,
          items: [
            expect.objectContaining({
              name: 'Margherita Pizza',
              qty: 1,
              price: 550,
            }),
          ],
        })
      );
      expect(handleAdded).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
