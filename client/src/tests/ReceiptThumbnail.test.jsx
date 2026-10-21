import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReceiptThumbnail from '../components/ReceiptThumbnail.jsx';
import api from '../api/axios.js';

vi.mock('../api/axios.js', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('ReceiptThumbnail Component', () => {
  const mockGroupId = 'grp_123';
  const mockReceiptKey = 'receipts/user1/test-receipt-001.jpg';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches presigned URL and renders thumbnail image with tap-to-enlarge', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          url: 'https://s3.amazonaws.com/finsight/receipt.jpg?token=abc',
          notice: 'Receipt available for 30 days',
        },
      },
    });

    render(
      <ReceiptThumbnail
        groupId={mockGroupId}
        receiptKey={mockReceiptKey}
        alt="Dinner receipt"
        size="md"
      />
    );

    // Initial loading indicator
    expect(screen.getByLabelText(/Loading receipt thumbnail/i)).toBeInTheDocument();

    // After fetch resolves, thumbnail should be displayed
    await waitFor(() => {
      expect(screen.getByAltText('Dinner receipt')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Enlarge receipt thumbnail/i })).toBeInTheDocument();
    });

    // Tap to enlarge
    fireEvent.click(screen.getByRole('button', { name: /Enlarge receipt thumbnail/i }));

    // Modal dialog opens
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByAltText('Enlarged receipt')).toBeInTheDocument();
    expect(screen.getByText(/Receipt available for 30 days/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open full size ↗/i })).toHaveAttribute(
      'href',
      'https://s3.amazonaws.com/finsight/receipt.jpg?token=abc'
    );

    // Close modal
    const closeButtons = screen.getAllByRole('button', { name: /Close/i });
    fireEvent.click(closeButtons[0]);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('gracefully handles missing or expired receipts (30-day lifecycle) without breaking', async () => {
    api.get.mockRejectedValueOnce({
      response: { status: 404, data: { message: 'Receipt not found in this group' } },
    });

    render(
      <ReceiptThumbnail
        groupId={mockGroupId}
        receiptKey="receipts/user1/expired-receipt.jpg"
        alt="Expired receipt"
      />
    );

    await waitFor(() => {
      expect(
        screen.getByTitle(/Receipt unavailable \(expired after 30 days or not found\)/i)
      ).toBeInTheDocument();
    });

    // Should not render enlarged modal button
    expect(screen.queryByRole('button', { name: /Enlarge receipt thumbnail/i })).not.toBeInTheDocument();
  });
});
