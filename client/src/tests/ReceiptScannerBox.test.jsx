import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReceiptScannerBox from '../components/ReceiptScannerBox.jsx';
import api from '../api/axios.js';

vi.mock('../api/axios.js', () => ({
  default: {
    post: vi.fn(),
    put: vi.fn(),
  },
}));

// Mock URL.createObjectURL
window.URL.createObjectURL = vi.fn(() => 'blob:mock-image-preview');

describe('ReceiptScannerBox Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders upload dropzone instructions', () => {
    render(<ReceiptScannerBox onTransactionCreated={vi.fn()} />);

    expect(screen.getByText(/Smart Receipt Scanner/i)).toBeInTheDocument();
    expect(screen.getByText(/Drop receipt photo here or click to browse/i)).toBeInTheDocument();
  });

  it('renders extracted data and mismatch banner when totals differ', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/receipts/upload-url') {
        return Promise.reject(new Error('S3 direct upload disabled in test'));
      }
      if (url === '/transactions/receipt/scan') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              merchant: 'Cafe Coffee Day',
              vendor: 'Cafe Coffee Day',
              date: '2026-03-15',
              total: 500,
              subtotal: 400,
              tax: 50,
              serviceCharge: 0,
              discount: 0,
              mismatch: true, // 400 + 50 = 450 != 500
              items: [{ name: 'Cappuccino', description: 'Cappuccino', quantity: 2, unitPrice: 200, price: 400 }],
            },
          },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    render(<ReceiptScannerBox onTransactionCreated={vi.fn()} />);

    // Create a mock file
    const file = new File(['mock content'], 'receipt.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/Upload receipt document/i);

    fireEvent.change(input, { target: { files: [file] } });

    // Click Scan Receipt button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Scan Receipt/i })).not.toBeDisabled();
    }, { timeout: 4000 });
    fireEvent.click(screen.getByRole('button', { name: /Scan Receipt/i }));

    // Wait for review form to display
    await waitFor(() => {
      expect(screen.getByText(/Check the totals/i)).toBeInTheDocument();
      expect(screen.getByText(/differs from the final total/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('Cafe Coffee Day')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Cappuccino')).toBeInTheDocument();
    });
  });

  it('saves confirmed transaction and calls onTransactionCreated', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/receipts/upload-url') {
        return Promise.reject(new Error('S3 direct upload disabled in test'));
      }
      if (url === '/transactions/receipt/scan') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              merchant: 'Starbucks',
              vendor: 'Starbucks',
              date: '2026-03-15',
              total: 350,
              subtotal: 350,
              tax: 0,
              serviceCharge: 0,
              discount: 0,
              mismatch: false,
              items: [{ name: 'Latte', description: 'Latte', quantity: 1, unitPrice: 350, price: 350 }],
            },
          },
        });
      }
      if (url === '/transactions') {
        return Promise.resolve({
          data: {
            success: true,
            data: { _id: 'tx_receipt_1', amount: 350, category: 'Food & Dining' },
          },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    const handleCreated = vi.fn();
    render(<ReceiptScannerBox onTransactionCreated={handleCreated} />);

    const file = new File(['mock content'], 'receipt.png', { type: 'image/png' });
    const input = screen.getByLabelText(/Upload receipt document/i);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Scan Receipt/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Scan Receipt/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Starbucks')).toBeInTheDocument();
    });

    // Click Confirm & Save button
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Save/i }));

    await waitFor(() => {
      expect(handleCreated).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'tx_receipt_1', amount: 350 })
      );
    });
  });
});
