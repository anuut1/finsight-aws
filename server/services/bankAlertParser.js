const { VALID_CATEGORIES } = require('./quickAddParser');

/**
 * Intelligent deterministic parser for Indian and international Bank & UPI SMS/Emails.
 */
function parseBankAlertHeuristics(text, context = {}) {
  const clean = text.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();
  const lower = clean.toLowerCase();
  const today = context.currentDate || new Date().toISOString().slice(0, 10);

  // 1. Determine Type: Credit vs Debit
  const creditKeywords = [
    'credited',
    'credit',
    'received',
    'refund',
    'deposited',
    'cashback',
    'salary',
    'transferred to your a/c',
  ];
  const isCredit = creditKeywords.some((k) => lower.includes(k));
  const type = isCredit ? 'income' : 'expense';

  // 2. Extract Amount
  // Matches: INR 450.00, Rs. 1,250.00, Rs 500, ₹1200, debited by 350.50, USD 40, $25
  let amount = 0;
  const amountRegexes = [
    /(?:(?:rs\.?|inr|₹|\$)\s*)([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
    /(?:debited|credited|withdrawn|spent|paid)\s+(?:by|of|for)?\s*(?:(?:rs\.?|inr|₹|\$)\s*)?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
    /(?:vpa|upi)\s+(?:(?:rs\.?|inr|₹|\$)\s*)?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
    /([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:(?:rs\.?|inr|₹|\$)|debited|credited)/i,
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

  // 3. Extract Merchant / Beneficiary / Info
  let merchant = '';

  // Pattern A: "to <Merchant> UPI" or "to <Merchant> on" or "to <Merchant> Ref"
  const toMatch = clean.match(/(?:to|at|info:|beneficiary|vpa)\s+([a-zA-Z0-9\s&._'-]+?)(?:\s+(?:upi|on|ref|avl|available|using|via|dated|balance|\/|\.|$))/i);
  if (toMatch && toMatch[1]) {
    merchant = toMatch[1].trim();
  }

  // Pattern B: "spent on ... Card ending ... at <Merchant> on"
  const spentAtMatch = clean.match(/(?:at|for)\s+([a-zA-Z0-9\s&._'-]+?)(?:\s+(?:on|dated|using|ref|\.|$))/i);
  if (!merchant && spentAtMatch && spentAtMatch[1]) {
    merchant = spentAtMatch[1].trim();
  }

  // Pattern C: "Paid ₹... to <Merchant>"
  const paidToMatch = clean.match(/(?:paid|sent)\s+(?:(?:rs\.?|inr|₹|\$)\s*)?[0-9,.]+\s+(?:to|for)\s+([a-zA-Z0-9\s&._'-]+?)(?:\s+(?:using|via|on|ref|\.|$))/i);
  if (paidToMatch && paidToMatch[1]) {
    merchant = paidToMatch[1].trim();
  }

  // Clean unwanted noise from extracted merchant
  merchant = merchant
    .replace(/(?:vpa|upi|bank|card|account|a\/c|ref\s*no\.?|avl\s*bal).*/i, '')
    .replace(/[^a-zA-Z0-9\s&'-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 4. Extract Account Info (Last 4 digits or card number)
  let accountInfo = '';
  const acctMatch = clean.match(/(?:a\/c|acct|card|ending|xx)\s*[:#*]?\s*([x*]*[0-9]{3,4})/i);
  if (acctMatch && acctMatch[1]) {
    accountInfo = acctMatch[1].replace(/[*x]/gi, '').trim();
    if (accountInfo) accountInfo = `xx${accountInfo}`;
  }

  // 5. Extract Date
  let date = today;
  // Match dates like 03-OCT-26, 03-10-2026, 03 Oct 2026, 2026-10-03, 03/10/26
  const dateMatch = clean.match(/\b([0-9]{1,2})[-/]([a-zA-Z]{3}|[0-9]{1,2})[-/]([0-9]{2,4})\b/);
  if (dateMatch) {
    const [, day, mon, yr] = dateMatch;
    const yearFull = yr.length === 2 ? `20${yr}` : yr;
    let monthNum = '';

    const monthsMap = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };

    if (monthsMap[mon.toLowerCase()]) {
      monthNum = monthsMap[mon.toLowerCase()];
    } else {
      monthNum = String(mon).padStart(2, '0');
    }

    const dayPad = String(day).padStart(2, '0');
    const candidateDate = `${yearFull}-${monthNum}-${dayPad}`;
    if (!isNaN(Date.parse(candidateDate))) {
      date = candidateDate;
    }
  }

  // 6. Category Mapping based on Merchant & Keywords
  let category = type === 'income' ? 'Salary' : 'Other';
  const mLower = (merchant + ' ' + lower).toLowerCase();

  if (/swiggy|zomato|starbucks|mcdonald|kfc|burger|pizza|cafe|restaurant|tea|coffee|eats|dine|food/i.test(mLower)) {
    category = 'Food & Dining';
  } else if (/blinkit|zepto|instamart|supermarket|mart|grocery|groceries|bigbasket|nature's basket|dmart/i.test(mLower)) {
    category = 'Groceries';
  } else if (/uber|ola|rapido|metro|petrol|fuel|diesel|indianoil|hpcl|bpcl|flight|irctc|makemytrip|indigo|airways/i.test(mLower)) {
    category = 'Travel';
  } else if (/amazon|flipkart|myntra|zara|h&m|ajio|shopping|retail|store|mall|nykaa/i.test(mLower)) {
    category = 'Shopping';
  } else if (/airtel|jio|vi\b|bescom|electricity|power|broadband|wifi|bill|utility|tataplay|recharge/i.test(mLower)) {
    category = 'Bills & Utilities';
  } else if (/netflix|spotify|prime|hotstar|bookmyshow|pvr|inox|cinema|movie|youtube/i.test(mLower)) {
    category = 'Entertainment';
  } else if (/apollo|pharmacy|chemist|hospital|clinic|1mg|practo|medplus|doctor/i.test(mLower)) {
    category = 'Healthcare';
  } else if (/zerodha|groww|upstox|mutual\s*fund|sip|investment|uti|hdfc\s*mf|icici\s*pru/i.test(mLower)) {
    category = 'Investment';
  } else if (/salary|payroll|stipend|wages/i.test(mLower)) {
    category = 'Salary';
  }

  // Build clean final description
  let description = merchant ? merchant : isCredit ? 'Bank Credit' : 'Bank Debit';
  if (accountInfo) {
    description = `${description} (${accountInfo})`;
  }

  // Build metadata tags
  const tags = ['bank-alert'];
  if (/upi/i.test(lower)) tags.push('upi');
  if (/card/i.test(lower)) tags.push('card');
  if (accountInfo) tags.push(accountInfo);

  return {
    type,
    amount: Math.round((amount + Number.EPSILON) * 100) / 100,
    category,
    date,
    description,
    merchant: merchant || (isCredit ? 'Bank Deposit' : 'Bank Expense'),
    accountInfo: accountInfo || null,
    tags,
    mood: 'neutral',
    rawText: clean,
  };
}

/**
 * Parses Bank/UPI alerts using Gemini if configured, otherwise falls back to heuristics.
 */
async function parseBankAlert(text, context = {}) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const today = context.currentDate || new Date().toISOString().slice(0, 10);

  if (geminiKey) {
    try {
      const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      const prompt = `You are a financial parsing assistant for FinSight.
Parse this bank or UPI SMS/email notification: "${text}".
Reference date: ${today}.
Valid categories: ${VALID_CATEGORIES.join(', ')}.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  type: { type: 'STRING', enum: ['expense', 'income'] },
                  amount: { type: 'NUMBER' },
                  category: { type: 'STRING', enum: VALID_CATEGORIES },
                  date: { type: 'STRING' },
                  description: { type: 'STRING' },
                  merchant: { type: 'STRING' },
                  accountInfo: { type: 'STRING' },
                },
                required: ['type', 'amount', 'category', 'date', 'description'],
              },
              temperature: 0.1,
            },
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        const rawJson = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJson) {
          const parsed = JSON.parse(rawJson);
          return {
            type: parsed.type === 'income' ? 'income' : 'expense',
            amount: Math.round((Number(parsed.amount) + Number.EPSILON) * 100) / 100 || 0,
            category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'Other',
            date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : today,
            description: parsed.description || parsed.merchant || 'Bank Transaction',
            merchant: parsed.merchant || parsed.description || '',
            accountInfo: parsed.accountInfo || null,
            tags: ['bank-alert', 'sms-import'],
            mood: 'neutral',
            rawText: text.trim(),
          };
        }
      }
    } catch (err) {
      console.warn('Gemini bank alert parser error, falling back to heuristics:', err.message);
    }
  }

  // Deterministic heuristic fallback
  return parseBankAlertHeuristics(text, context);
}

module.exports = {
  parseBankAlert,
  parseBankAlertHeuristics,
};
