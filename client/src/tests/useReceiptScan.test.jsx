import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useReceiptScan from '../hooks/useReceiptScan';
import { normalizeReceiptResult, mapReceiptError } from '../utils/receiptImage';
import api from '../api/axios';

vi.mock('../api/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('useReceiptScan hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with idle state', () => {
    const { result } = renderHook(() => useReceiptScan());
    expect(result.current.status).toBe('idle');
    expect(result.current.scanning).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe('');
    expect(result.current.receiptKey).toBe('');
    expect(result.current.uploadProgress).toBe(0);
  });

  it('scans via direct fallback when S3 upload fails and returns normalized result', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/receipts/upload-url') {
        return Promise.reject(new Error('S3 direct upload unavailable'));
      }
      if (url === '/transactions/receipt/scan') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              merchant: 'Blue Tokai Coffee',
              date: '2026-03-20',
              total: 420,
              subtotal: 400,
              tax: 20,
              items: [{ name: 'Cold Brew', quantity: 2, price: 400 }],
              s3Key: 'receipts/test-user/sample.jpg',
            },
          },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    const { result } = renderHook(() => useReceiptScan());
    const mockFile = new File(['image-bytes'], 'receipt.jpg', { type: 'image/jpeg' });

    let scanRes;
    await act(async () => {
      scanRes = await result.current.scanReceipt(mockFile);
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.receiptKey).toBe('receipts/test-user/sample.jpg');
    expect(scanRes).toBeTruthy();
    expect(scanRes.merchant).toBe('Blue Tokai Coffee');
    expect(scanRes.amount).toBe(420);
    expect(scanRes.tax).toBe(20);
    expect(scanRes.items).toHaveLength(1);
    expect(scanRes.mismatch).toBe(false);
  });

  it('detects mismatch when subtotal + tax != total', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/receipts/upload-url') {
        return Promise.reject(new Error('S3 error'));
      }
      if (url === '/transactions/receipt/scan') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              merchant: 'Dinner Place',
              total: 1000,
              subtotal: 800,
              tax: 50, // 800 + 50 = 850 != 1000
              items: [{ name: 'Pasta', price: 800 }],
            },
          },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    const { result } = renderHook(() => useReceiptScan());
    const mockFile = new File(['image-bytes'], 'dinner.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.scanReceipt(mockFile);
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.result.mismatch).toBe(true);
  });

  it('maps actionable AWS error codes correctly on scan failure', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/receipts/upload-url') {
        return Promise.reject(new Error('S3 error'));
      }
      if (url === '/transactions/receipt/scan') {
        const error = new Error('Subscription required for AWS Textract');
        error.response = {
          data: {
            message: 'AWS Textract is not enabled for this AWS account tier.',
            code: 'SubscriptionRequiredException',
            requestId: 'req-12345',
          },
        };
        return Promise.reject(error);
      }
      return Promise.reject(new Error('Unknown'));
    });

    const { result } = renderHook(() => useReceiptScan());
    const mockFile = new File(['image-bytes'], 'receipt.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.scanReceipt(mockFile);
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toContain('AWS Textract is not enabled');
    expect(result.current.error).toContain('SubscriptionRequiredException');
    expect(result.current.error).toContain('req-12345');
  });

  it('clears state on reset()', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/receipts/upload-url') {
        return Promise.reject(new Error('S3 error'));
      }
      if (url === '/transactions/receipt/scan') {
        return Promise.resolve({
          data: {
            success: true,
            data: { merchant: 'Cafe', total: 100, items: [] },
          },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    const { result } = renderHook(() => useReceiptScan());
    const mockFile = new File(['img'], 'receipt.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.scanReceipt(mockFile);
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.result).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe('');
    expect(result.current.receiptKey).toBe('');
  });
});

describe('receiptImage utilities', () => {
  it('normalizes raw scan results with default fallbacks', () => {
    const raw = {
      vendor: 'Supermarket',
      total: '150.50',
      subtotal: '140.00',
      tax: '10.50',
      lineItems: [
        { name: 'Apples', quantity: 2, unitPrice: '50.00', price: '100.00' },
        { name: 'Milk', quantity: 1, unitPrice: '40.00', price: '40.00' },
      ],
      s3Key: 'receipts/usr/doc.jpg',
    };

    const normalized = normalizeReceiptResult(raw, 'http://preview.url');
    expect(normalized.merchant).toBe('Supermarket');
    expect(normalized.amount).toBe(150.5);
    expect(normalized.subtotal).toBe(140);
    expect(normalized.tax).toBe(10.5);
    expect(normalized.mismatch).toBe(false);
    expect(normalized.items).toHaveLength(2);
    expect(normalized.items[0].description).toBe('2x Apples');
    expect(normalized.receiptKey).toBe('receipts/usr/doc.jpg');
    expect(normalized.receiptUrl).toBe('http://preview.url');
  });

  it('maps generic error message when error is unrecognized', () => {
    const err = new Error('Some internal unhandled socket reset');
    const msg = mapReceiptError(err);
    expect(msg).toBe("Couldn't read this receipt, try a clearer photo or enter it manually");
  });
});
