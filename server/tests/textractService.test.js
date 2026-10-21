const {
  extractFromTextractResponse,
  normalizeAmount,
  normalizeDate,
  validateReceiptInput,
} = require('../services/textractService');

describe('textractService - Unit Tests', () => {
  describe('normalizeAmount', () => {
    test('normalizes numbers and float strings with currency symbols and commas', () => {
      expect(normalizeAmount(1250)).toBe(1250);
      expect(normalizeAmount('₹1,250.00')).toBe(1250);
      expect(normalizeAmount('$45.99')).toBe(45.99);
      expect(normalizeAmount('€ 1,299.50')).toBe(1299.5);
      expect(normalizeAmount('   345.00   ')).toBe(345);
      expect(normalizeAmount('')).toBe(0);
      expect(normalizeAmount(null)).toBe(0);
      expect(normalizeAmount(undefined)).toBe(0);
    });

    test('handles negative amounts, parenthesized discounts, and signs', () => {
      expect(normalizeAmount('-45.00')).toBe(-45);
      expect(normalizeAmount('(150.50)')).toBe(-150.5);
      expect(normalizeAmount('₹ -500')).toBe(-500);
    });

    test('handles Indian currency notations and suffixes', () => {
      expect(normalizeAmount('Rs. 2,450/-')).toBe(2450);
      expect(normalizeAmount('INR 1,23,456.00')).toBe(123456);
      expect(normalizeAmount('₹ 1,500/-')).toBe(1500);
      expect(normalizeAmount('420,50')).toBe(420.5); // decimal comma
    });
  });

  describe('normalizeDate', () => {
    test('parses standard ISO date or formatted dates', () => {
      expect(normalizeDate('2026-10-03')).toBe('2026-10-03');
      expect(normalizeDate('03-Oct-2026')).toBe('2026-10-03');
      expect(normalizeDate('15/08/2026')).toBe('2026-08-15');
    });

    test('parses numeric dates as day-first by default for Indian receipts', () => {
      // 05/10/2026 should parse as 5th October 2026 (2026-10-05), NOT May 10th
      expect(normalizeDate('05/10/2026')).toBe('2026-10-05');
      expect(normalizeDate('01-09-2026')).toBe('2026-09-01');
    });

    test('handles 2-digit years correctly', () => {
      expect(normalizeDate('14/10/26')).toBe('2026-10-14');
    });

    test('rejects unparseable or future dates falling back to today', () => {
      const today = new Date().toISOString().slice(0, 10);
      expect(normalizeDate('not-a-valid-date')).toBe(today);
      expect(normalizeDate('')).toBe(today);
      // Future date in 2099
      expect(normalizeDate('2099-12-31')).toBe(today);
      expect(normalizeDate('31/12/2099')).toBe(today);
    });
  });

  describe('extractFromTextractResponse', () => {
    test('extracts clean shape with vendor, date, items (with qty and unitPrice), subtotal, tax, serviceCharge, discount, total, and flags mismatch', () => {
      const mockResponse = {
        ExpenseDocuments: [
          {
            ExpenseIndex: 1,
            SummaryFields: [
              {
                Type: { Text: 'VENDOR_NAME', Confidence: 99.2 },
                ValueDetection: { Text: 'PUNJAB GRILL RESTAURANT', Confidence: 99.2 },
              },
              {
                Type: { Text: 'INVOICE_RECEIPT_DATE', Confidence: 98.0 },
                ValueDetection: { Text: '05/10/2026', Confidence: 98.0 },
              },
              {
                Type: { Text: 'SUBTOTAL', Confidence: 95.5 },
                ValueDetection: { Text: '₹1,200.00', Confidence: 95.5 },
              },
              {
                Type: { Text: 'GST', Confidence: 94.0 },
                ValueDetection: { Text: '₹60.00', Confidence: 94.0 },
              },
              {
                Type: { Text: 'SERVICE_CHARGE', Confidence: 92.0 },
                ValueDetection: { Text: '₹120.00', Confidence: 92.0 },
              },
              {
                Type: { Text: 'DISCOUNT', Confidence: 95.0 },
                ValueDetection: { Text: '₹100.00', Confidence: 95.0 },
              },
              {
                Type: { Text: 'TOTAL', Confidence: 99.0 },
                ValueDetection: { Text: '₹1,280.00', Confidence: 99.0 }, // 1200 + 60 + 120 - 100 = 1280
              },
            ],
            LineItemGroups: [
              {
                LineItemGroupIndex: 1,
                LineItems: [
                  {
                    LineItemExpenseFields: [
                      {
                        Type: { Text: 'ITEM', Confidence: 95.0 },
                        ValueDetection: { Text: 'Butter Chicken', Confidence: 95.0 },
                      },
                      {
                        Type: { Text: 'QUANTITY', Confidence: 92.0 },
                        ValueDetection: { Text: '2', Confidence: 92.0 },
                      },
                      {
                        Type: { Text: 'UNIT_PRICE', Confidence: 94.0 },
                        ValueDetection: { Text: '₹450.00', Confidence: 94.0 },
                      },
                      {
                        Type: { Text: 'PRICE', Confidence: 97.0 },
                        ValueDetection: { Text: '₹900.00', Confidence: 97.0 },
                      },
                    ],
                  },
                  {
                    LineItemExpenseFields: [
                      {
                        Type: { Text: 'ITEM', Confidence: 96.0 },
                        ValueDetection: { Text: 'Garlic Naan', Confidence: 96.0 },
                      },
                      {
                        Type: { Text: 'QUANTITY', Confidence: 90.0 },
                        ValueDetection: { Text: '3', Confidence: 90.0 },
                      },
                      {
                        Type: { Text: 'UNIT_PRICE', Confidence: 90.0 },
                        ValueDetection: { Text: '₹100.00', Confidence: 90.0 },
                      },
                      {
                        Type: { Text: 'PRICE', Confidence: 96.5 },
                        ValueDetection: { Text: '₹300.00', Confidence: 96.5 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = extractFromTextractResponse(mockResponse);

      expect(result.vendor).toBe('PUNJAB GRILL RESTAURANT');
      expect(result.date).toBe('2026-10-05'); // DD/MM day-first
      expect(result.subtotal).toBe(1200);
      expect(result.tax).toBe(60);
      expect(result.serviceCharge).toBe(120);
      expect(result.discount).toBe(100);
      expect(result.total).toBe(1280);
      expect(result.mismatch).toBe(false);

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        name: 'Butter Chicken',
        description: 'Butter Chicken',
        quantity: 2,
        unitPrice: 450,
        price: 900,
      });

      expect(result.items[1]).toEqual({
        name: 'Garlic Naan',
        description: 'Garlic Naan',
        quantity: 3,
        unitPrice: 100,
        price: 300,
      });
    });

    test('flags mismatch=true when line items and charges differ from total by more than ₹1', () => {
      const mockResponse = {
        ExpenseDocuments: [
          {
            ExpenseIndex: 1,
            SummaryFields: [
              { Type: { Text: 'VENDOR_NAME' }, ValueDetection: { Text: 'Cafe Mocha' } },
              { Type: { Text: 'SUBTOTAL' }, ValueDetection: { Text: '500.00' } },
              { Type: { Text: 'TAX' }, ValueDetection: { Text: '25.00' } },
              { Type: { Text: 'TOTAL' }, ValueDetection: { Text: '600.00' } }, // Expected 525, diff is 75 > 1
            ],
            LineItemGroups: [
              {
                LineItems: [
                  {
                    LineItemExpenseFields: [
                      { Type: { Text: 'ITEM' }, ValueDetection: { Text: 'Coffee' } },
                      { Type: { Text: 'PRICE' }, ValueDetection: { Text: '500.00' } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = extractFromTextractResponse(mockResponse);
      expect(result.mismatch).toBe(true);
      expect(result.mismatchDifference).toBe(75);
    });

    test('calculates subtotal and total from items if summary fields are missing', () => {
      const mockResponse = {
        ExpenseDocuments: [
          {
            ExpenseIndex: 1,
            SummaryFields: [
              {
                Type: { Text: 'VENDOR_NAME', Confidence: 95.0 },
                ValueDetection: { Text: 'Corner Bakery', Confidence: 95.0 },
              },
            ],
            LineItemGroups: [
              {
                LineItems: [
                  {
                    LineItemExpenseFields: [
                      { Type: { Text: 'ITEM' }, ValueDetection: { Text: 'Croissant', Confidence: 95 } },
                      { Type: { Text: 'PRICE' }, ValueDetection: { Text: '120.00', Confidence: 95 } },
                    ],
                  },
                  {
                    LineItemExpenseFields: [
                      { Type: { Text: 'ITEM' }, ValueDetection: { Text: 'Latte', Confidence: 95 } },
                      { Type: { Text: 'PRICE' }, ValueDetection: { Text: '180.00', Confidence: 95 } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = extractFromTextractResponse(mockResponse);
      expect(result.subtotal).toBe(300);
      expect(result.tax).toBe(0);
      expect(result.total).toBe(300);
      expect(result.lowConfidenceItems).toHaveLength(0);
      expect(result.mismatch).toBe(false);
    });

    test('throws NO_ITEMS_DETECTED error if no line items are found', () => {
      const emptyItemsResponse = {
        ExpenseDocuments: [
          {
            ExpenseIndex: 1,
            SummaryFields: [
              { Type: { Text: 'VENDOR_NAME' }, ValueDetection: { Text: 'ATM Receipt' } },
            ],
            LineItemGroups: [],
          },
        ],
      };

      expect(() => extractFromTextractResponse(emptyItemsResponse)).toThrow(
        /No line items detected on receipt/
      );
    });

    test('throws NO_DOCUMENT_FOUND error if ExpenseDocuments is empty', () => {
      expect(() => extractFromTextractResponse({})).toThrow(
        /No expense document detected/
      );
    });
  });

  describe('validateReceiptInput', () => {
    test('accepts valid JPEG, PNG, and PDF buffers', () => {
      const smallBuffer = Buffer.from('fake image content');
      expect(() => validateReceiptInput(smallBuffer, 'image/jpeg')).not.toThrow();
      expect(() => validateReceiptInput(smallBuffer, 'image/png')).not.toThrow();
      expect(() => validateReceiptInput(smallBuffer, 'application/pdf')).not.toThrow();
    });

    test('rejects HEIC with specific helpful error', () => {
      const buffer = Buffer.from('fake heic');
      expect(() => validateReceiptInput(buffer, 'image/heic')).toThrow(/HEIC format from iPhones/);
    });

    test('rejects WebP with specific error', () => {
      const buffer = Buffer.from('fake webp');
      expect(() => validateReceiptInput(buffer, 'image/webp')).toThrow(/WebP format is not supported/);
    });

    test('rejects files larger than 10MB', () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
      expect(() => validateReceiptInput(largeBuffer, 'image/jpeg')).toThrow(/exceeds the 10MB limit/);
    });
  });
});
