/**
 * Parses a standard upi://pay URI according to NPCI specifications:
 * upi://pay?pa=merchant@bank&pn=MerchantName&am=450.00&tn=Note&cu=INR&tr=ref123
 */
export function parseUpiPayUri(uri) {
  if (!uri || typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  if (!trimmed.toLowerCase().startsWith('upi://pay')) return null;

  try {
    const questionIdx = trimmed.indexOf('?');
    if (questionIdx === -1) return null;
    const query = trimmed.slice(questionIdx + 1);
    const params = new URLSearchParams(query);

    const pa = params.get('pa') || ''; // Payee VPA
    const pn = params.get('pn') || ''; // Payee Name
    const am = params.get('am') || ''; // Amount
    const tn = params.get('tn') || ''; // Note
    const tr = params.get('tr') || ''; // Transaction Ref

    return {
      vpa: pa,
      merchantName: pn || pa.split('@')[0] || 'Merchant',
      amount: am ? Number(am) : null,
      note: tn,
      ref: tr,
      rawUri: trimmed,
    };
  } catch (e) {
    console.warn('Failed to parse UPI URI:', e);
    return null;
  }
}

/**
 * Parses bank SMS / email notification alert text deterministically.
 */
export function parseBankAlertText(text) {
  if (!text || typeof text !== 'string') return { amount: null, merchant: '' };
  const clean = text.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();

  // Amount extraction
  let amount = null;
  const amountRegexes = [
    /(?:(?:rs\.?|inr|₹|\$)\s*)([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
    /(?:debited|spent|paid)\s+(?:by|of|for)?\s*(?:(?:rs\.?|inr|₹|\$)\s*)?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
    /(?:vpa|upi)\s+(?:(?:rs\.?|inr|₹|\$)\s*)?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
  ];

  for (const regex of amountRegexes) {
    const match = clean.match(regex);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  // Merchant extraction
  let merchant = '';
  const toMatch = clean.match(
    /(?:to|at|info:|beneficiary|vpa)\s+([a-zA-Z0-9\s&._'-]+?)(?:\s+(?:upi|on|ref|avl|available|using|via|dated|balance|\/|\.|$))/i
  );
  if (toMatch && toMatch[1]) {
    merchant = toMatch[1].trim();
  }

  return { amount, merchant };
}
