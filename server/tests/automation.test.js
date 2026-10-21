const { fallbackRuleBasedClean, cleanAndCategorizeExpense } = require('../services/bedrockService');

describe('Automation & Bedrock Service Tests', () => {
  test('fallbackRuleBasedClean extracts clean merchant from messy UPI string', () => {
    const raw = 'UPI/4289192837/SWIGGY5281/swiggy@icici/Bengaluru';
    const result = fallbackRuleBasedClean(raw);

    expect(result.cleanMerchant.toLowerCase()).toContain('swiggy');
    expect(result.category).toBe('Food & Dining');
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('fallbackRuleBasedClean extracts grocery brand from raw transaction text', () => {
    const raw = 'Txn 99482 paid to Blinkit Commerce Gurgaon';
    const result = fallbackRuleBasedClean(raw);

    expect(result.cleanMerchant.toLowerCase()).toContain('blinkit');
    expect(result.category).toBe('Groceries');
  });

  test('fallbackRuleBasedClean handles arbitrary unknown merchant gracefully', () => {
    const raw = 'Payment to John Doe for repair work';
    const result = fallbackRuleBasedClean(raw);

    expect(result.cleanMerchant).toBeDefined();
    expect(result.category).toBe('Uncategorized');
  });

  test('cleanAndCategorizeExpense returns default for empty input without throwing', async () => {
    const result = await cleanAndCategorizeExpense({ rawString: '' });

    expect(result.cleanMerchant).toBe('Unknown Merchant');
    expect(result.category).toBe('Uncategorized');
  });
});
