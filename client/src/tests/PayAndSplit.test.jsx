import { describe, it, expect } from 'vitest';
import { parseUpiPayUri, parseBankAlertText } from '../utils/upiHelpers';

describe('Payment App URI and SMS Heuristics Parsers', () => {
  it('parses standard upi://pay URI correctly', () => {
    const uri = 'upi://pay?pa=chaiwala@okaxis&pn=Sharma%20Tea%20Stall&am=120.00&cu=INR&tn=Evening%20Snacks';
    const parsed = parseUpiPayUri(uri);

    expect(parsed).not.toBeNull();
    expect(parsed.vpa).toBe('chaiwala@okaxis');
    expect(parsed.merchantName).toBe('Sharma Tea Stall');
    expect(parsed.amount).toBe(120);
    expect(parsed.note).toBe('Evening Snacks');
  });

  it('handles upi://pay URI without amount or note gracefully', () => {
    const uri = 'upi://pay?pa=kiranastore@upi&pn=Kirana';
    const parsed = parseUpiPayUri(uri);

    expect(parsed).not.toBeNull();
    expect(parsed.vpa).toBe('kiranastore@upi');
    expect(parsed.merchantName).toBe('Kirana');
    expect(parsed.amount).toBeNull();
  });

  it('returns null for invalid URIs', () => {
    expect(parseUpiPayUri('https://google.com')).toBeNull();
    expect(parseUpiPayUri('')).toBeNull();
    expect(parseUpiPayUri(null)).toBeNull();
  });

  it('parses typical Indian bank debit SMS text', () => {
    const sms = 'Sent Rs. 450.00 to CAFE NIRVANA via UPI on 17-Oct-26. Ref no 99882211. Avl Bal: Rs 12,000';
    const parsed = parseBankAlertText(sms);

    expect(parsed.amount).toBe(450);
    expect(parsed.merchant).toBe('CAFE NIRVANA');
  });

  it('parses spent at merchant SMS alert', () => {
    const sms = 'Debited by ₹ 1,250.50 at PVR CINEMAS on 16/10/2026 using card ending xx4091';
    const parsed = parseBankAlertText(sms);

    expect(parsed.amount).toBe(1250.5);
    expect(parsed.merchant).toBe('PVR CINEMAS');
  });
});
