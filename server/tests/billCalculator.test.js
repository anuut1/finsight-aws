const {
  calculateBillSplit,
  validateBillTotals,
  toPaise,
  fromPaise,
  resolveClaimantId,
} = require('../services/billCalculator');

describe('billCalculator - Unit Tests', () => {
  describe('Helper Functions', () => {
    test('toPaise converts rupees/float to integer paise correctly', () => {
      expect(toPaise(10)).toBe(1000);
      expect(toPaise(12.5)).toBe(1250);
      expect(toPaise(19.99)).toBe(1999);
      expect(toPaise('25.75')).toBe(2575);
      expect(toPaise(0)).toBe(0);
      expect(toPaise(null)).toBe(0);
      expect(toPaise(undefined)).toBe(0);
    });

    test('fromPaise converts integer paise to currency decimal string', () => {
      expect(fromPaise(1000)).toBe('10.00');
      expect(fromPaise(1250)).toBe('12.50');
      expect(fromPaise(1999)).toBe('19.99');
      expect(fromPaise(0)).toBe('0.00');
    });

    test('resolveClaimantId extracts ID from various formats', () => {
      expect(resolveClaimantId('user123')).toBe('user123');
      expect(resolveClaimantId({ userId: 'u1' })).toBe('u1');
      expect(resolveClaimantId({ guestId: 'g1' })).toBe('g1');
      expect(resolveClaimantId({ claimantId: 'c1' })).toBe('c1');
      expect(resolveClaimantId({ memberId: 'm1' })).toBe('m1');
    });

    test('validateBillTotals checks items + charges - discount = total', () => {
      const validBill = {
        items: [
          { name: 'Burger', price: 20000 },
          { name: 'Fries', price: 5000 },
        ],
        tax: 2500,
        serviceCharge: 1250,
        tip: 1000,
        discount: 1000,
        total: 28750, // 25000 + 2500 + 1250 + 1000 - 1000 = 28750
      };
      const result = validateBillTotals(validBill);
      expect(result.isValid).toBe(true);
      expect(result.discrepancy).toBe(0);
      expect(result.calculatedTotal).toBe(28750);

      const invalidBill = { ...validBill, total: 30000 };
      const invalidResult = validateBillTotals(invalidBill);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.discrepancy).toBe(-1250);
    });
  });

  describe('Core Split Calculation & Proportional Charges', () => {
    test('splits simple bill proportionally between host and member', () => {
      // Host paid.
      // Item 1 (Rs 300 = 30000 paise): claimed by Host
      // Item 2 (Rs 100 = 10000 paise): claimed by Alice
      // Items total: 40000 paise. Host = 75%, Alice = 25%
      // Tax: 2000 paise -> Host: 1500, Alice: 500
      // Tip: 1000 paise -> Host: 750, Alice: 250
      // Total: 43000 paise -> Host: 32250, Alice: 10750
      const bill = {
        paidBy: 'host_1',
        members: [
          { id: 'host_1', name: 'Host' },
          { id: 'alice_1', name: 'Alice' },
        ],
        items: [
          { name: 'Steak', qty: 1, price: 30000, claims: [{ userId: 'host_1' }] },
          { name: 'Salad', qty: 1, price: 10000, claims: [{ userId: 'alice_1' }] },
        ],
        tax: 2000,
        tip: 1000,
        total: 43000,
      };

      const result = calculateBillSplit(bill);

      expect(result.isValid).toBe(true);
      expect(result.itemsTotal).toBe(40000);
      expect(result.total).toBe(43000);

      const hostShare = result.shares['host_1'];
      const aliceShare = result.shares['alice_1'];

      expect(hostShare.itemsSubtotal).toBe(30000);
      expect(hostShare.taxShare).toBe(1500);
      expect(hostShare.tipShare).toBe(750);
      expect(hostShare.totalShare).toBe(32250);

      expect(aliceShare.itemsSubtotal).toBe(10000);
      expect(aliceShare.taxShare).toBe(500);
      expect(aliceShare.tipShare).toBe(250);
      expect(aliceShare.totalShare).toBe(10750);

      // Sum of shares equals exactly bill total
      expect(hostShare.totalShare + aliceShare.totalShare).toBe(43000);

      // Alice owes 10750 to host
      expect(result.settlementSummary).toEqual([
        {
          from: 'alice_1',
          fromName: 'Alice',
          to: 'host_1',
          toName: 'Host',
          amount: 10750,
        },
      ]);
    });

    test('shared item (qty 1 claimed by multiple members) is divided equally', () => {
      // Nachos (qty 1, price 3000 paise) claimed by Host, Alice, and Bob (1000 paise each)
      const bill = {
        paidBy: 'host_1',
        members: ['host_1', 'alice_1', 'bob_1'],
        items: [
          {
            name: 'Nachos Platter',
            qty: 1,
            price: 3000,
            claims: [{ userId: 'host_1' }, { userId: 'alice_1' }, { userId: 'bob_1' }],
          },
        ],
        tax: 300, // 100 each
        total: 3300,
      };

      const result = calculateBillSplit(bill);
      expect(result.shares['host_1'].itemsSubtotal).toBe(1000);
      expect(result.shares['alice_1'].itemsSubtotal).toBe(1000);
      expect(result.shares['bob_1'].itemsSubtotal).toBe(1000);

      expect(result.shares['host_1'].totalShare).toBe(1100);
      expect(result.shares['alice_1'].totalShare).toBe(1100);
      expect(result.shares['bob_1'].totalShare).toBe(1100);
      expect(result.shares['host_1'].totalShare + result.shares['alice_1'].totalShare + result.shares['bob_1'].totalShare).toBe(3300);
    });
  });

  describe('Edge Cases as Specified in Requirements', () => {
    test('Edge Case 1: item claimed by nobody with unclaimedPolicy="split_equally"', () => {
      // 3 items:
      // Item 1 (3000): Alice
      // Item 2 (3000): Bob
      // Item 3 (3000): Claimed by nobody!
      // Total items = 9000. Unclaimed = 3000.
      // Under split_equally among Host, Alice, Bob: 1000 each.
      // Subtotals: Host: 1000, Alice: 4000, Bob: 4000.
      const bill = {
        paidBy: 'host',
        members: ['host', 'alice', 'bob'],
        items: [
          { name: 'Burger A', qty: 1, price: 3000, claims: [{ userId: 'alice' }] },
          { name: 'Burger B', qty: 1, price: 3000, claims: [{ userId: 'bob' }] },
          { name: 'Shared Fries', qty: 1, price: 3000, claims: [] },
        ],
        tax: 900,
        total: 9900,
        unclaimedPolicy: 'split_equally',
      };

      const result = calculateBillSplit(bill);

      expect(result.unclaimedTotal).toBe(3000);
      expect(result.unclaimedItems.length).toBe(1);
      expect(result.unclaimedItems[0].name).toBe('Shared Fries');

      // Unclaimed is never dropped: each member gets 1000 unclaimed share
      expect(result.shares['host'].unclaimedShare).toBe(1000);
      expect(result.shares['alice'].unclaimedShare).toBe(1000);
      expect(result.shares['bob'].unclaimedShare).toBe(1000);

      // Subtotals:
      expect(result.shares['host'].subtotal).toBe(1000);
      expect(result.shares['alice'].subtotal).toBe(4000);
      expect(result.shares['bob'].subtotal).toBe(4000);

      // Totals sum exactly to 9900:
      const totalSum = Object.values(result.shares).reduce((sum, s) => sum + s.totalShare, 0);
      expect(totalSum).toBe(9900);
    });

    test('Edge Case 1b: item claimed by nobody with unclaimedPolicy="host_absorbs"', () => {
      // Unclaimed item (3000 paise) absorbed entirely by host
      const bill = {
        paidBy: 'host',
        members: ['host', 'alice', 'bob'],
        items: [
          { name: 'Burger A', qty: 1, price: 3000, claims: [{ userId: 'alice' }] },
          { name: 'Burger B', qty: 1, price: 3000, claims: [{ userId: 'bob' }] },
          { name: 'Extra Cake', qty: 1, price: 3000, claims: [] },
        ],
        tax: 900,
        total: 9900,
        unclaimedPolicy: 'host_absorbs',
      };

      const result = calculateBillSplit(bill);

      expect(result.unclaimedTotal).toBe(3000);
      expect(result.shares['host'].unclaimedShare).toBe(3000);
      expect(result.shares['alice'].unclaimedShare).toBe(0);
      expect(result.shares['bob'].unclaimedShare).toBe(0);

      expect(result.shares['host'].subtotal).toBe(3000);
      expect(result.shares['alice'].subtotal).toBe(3000);
      expect(result.shares['bob'].subtotal).toBe(3000);

      const totalSum = Object.values(result.shares).reduce((sum, s) => sum + s.totalShare, 0);
      expect(totalSum).toBe(9900);
    });

    test('Edge Case 2: one person claims everything', () => {
      // Host paid the bill of 10000 paise, but Alice claimed all items
      const bill = {
        paidBy: 'host',
        members: ['host', 'alice', 'bob'],
        items: [
          { name: 'Feast', qty: 1, price: 8000, claims: [{ userId: 'alice' }] },
        ],
        tax: 1000,
        serviceCharge: 1000,
        total: 10000,
      };

      const result = calculateBillSplit(bill);

      expect(result.shares['alice'].subtotal).toBe(8000);
      expect(result.shares['alice'].totalShare).toBe(10000);

      expect(result.shares['host'].totalShare).toBe(0);
      expect(result.shares['bob'].totalShare).toBe(0);

      // Alice owes 10000 to host
      expect(result.settlementSummary).toEqual([
        {
          from: 'alice',
          fromName: 'alice',
          to: 'host',
          toName: 'host',
          amount: 10000,
        },
      ]);
    });

    test('Edge Case 3: zero-price items', () => {
      // Complimentary water / bread with price = 0
      const bill = {
        paidBy: 'host',
        members: ['host', 'alice'],
        items: [
          { name: 'Water (complimentary)', qty: 2, price: 0, claims: [{ userId: 'host', units: 1 }, { userId: 'alice', units: 1 }] },
          { name: 'Pizza', qty: 1, price: 2000, claims: [{ userId: 'alice' }] },
        ],
        tax: 200,
        total: 2200,
      };

      const result = calculateBillSplit(bill);
      expect(result.shares['alice'].itemsSubtotal).toBe(2000);
      expect(result.shares['host'].itemsSubtotal).toBe(0);
      expect(result.shares['alice'].totalShare).toBe(2200);
      expect(result.shares['host'].totalShare).toBe(0);

      // Case where ALL items on bill have 0 price, but there is a service fee / tip
      const zeroItemsBill = {
        paidBy: 'host',
        members: ['host', 'alice'],
        items: [
          { name: 'Complimentary Tea', qty: 1, price: 0, claims: [{ userId: 'alice' }] },
        ],
        tip: 500,
        total: 500,
      };

      const zeroResult = calculateBillSplit(zeroItemsBill);
      expect(zeroResult.itemsTotal).toBe(0);
      // Splits tip equally without NaN
      expect(zeroResult.shares['host'].totalShare).toBe(250);
      expect(zeroResult.shares['alice'].totalShare).toBe(250);
      expect(zeroResult.shares['host'].totalShare + zeroResult.shares['alice'].totalShare).toBe(500);
    });

    test('Edge Case 4: discount larger than a subtotal', () => {
      // Alice had an espresso: 100 paise.
      // Host had a 3-course dinner: 1900 paise.
      // Items total = 2000 paise.
      // A massive voucher discount of 2500 paise (discount > subtotal and discount > itemsTotal)
      // Net bill total = 0 paise.
      const bill = {
        paidBy: 'host',
        members: ['host', 'alice'],
        items: [
          { name: 'Espresso', qty: 1, price: 100, claims: [{ userId: 'alice' }] },
          { name: 'Dinner', qty: 1, price: 1900, claims: [{ userId: 'host' }] },
        ],
        discount: 2500,
        total: 0,
      };

      const result = calculateBillSplit(bill);
      expect(result.shares['alice'].totalShare).toBe(0);
      expect(result.shares['host'].totalShare).toBe(0);
      expect(result.total).toBe(0);

      // Case where discount is larger than Alice's subtotal but bill has net positive amount
      // Alice: 50 paise. Host: 950 paise. Total items: 1000 paise.
      // Tax: 100 paise. Discount: 800 paise. Total: 300 paise.
      // Alice's ratio = 50 / 1000 = 0.05.
      // Proportional discount = 800 * 0.05 = 40 paise.
      // What if discount was 1200 paise, with tax 500 paise, total = 300 paise:
      // Alice's discount would be 1200 * 0.05 = 60 paise > Alice's subtotal of 50 paise.
      const largeDiscountBill = {
        paidBy: 'host',
        members: ['host', 'alice'],
        items: [
          { name: 'Tea', qty: 1, price: 50, claims: [{ userId: 'alice' }] },
          { name: 'Steak', qty: 1, price: 950, claims: [{ userId: 'host' }] },
        ],
        tax: 500,
        discount: 1200,
        total: 300, // (1000 + 500 - 1200 = 300)
      };

      const discountResult = calculateBillSplit(largeDiscountBill);
      expect(discountResult.shares['alice'].totalShare).toBeGreaterThanOrEqual(0);
      expect(discountResult.shares['host'].totalShare).toBeGreaterThanOrEqual(0);
      expect(discountResult.shares['alice'].totalShare + discountResult.shares['host'].totalShare).toBe(300);
    });

    test('Edge Case 5: uneven rounding leftovers go to the payer', () => {
      // 100 paise split equally among 3 people.
      // 100 / 3 = 33.333...
      // Non-payers get 33 paise each.
      // Payer gets 34 paise (33 + 1 leftover).
      // Sum must equal EXACTLY 100 paise.
      const bill = {
        paidBy: 'charlie',
        members: ['alice', 'bob', 'charlie'],
        items: [
          {
            name: 'Treat',
            qty: 1,
            price: 100,
            claims: [{ userId: 'alice' }, { userId: 'bob' }, { userId: 'charlie' }],
          },
        ],
        total: 100,
      };

      const result = calculateBillSplit(bill);
      expect(result.shares['alice'].totalShare).toBe(33);
      expect(result.shares['bob'].totalShare).toBe(33);
      expect(result.shares['charlie'].totalShare).toBe(34);
      expect(result.shares['charlie'].roundingDifference).toBe(1);

      // Verify exact sum
      const totalSum = result.shares['alice'].totalShare + result.shares['bob'].totalShare + result.shares['charlie'].totalShare;
      expect(totalSum).toBe(100);

      // Change payer to alice
      const billWithAlicePaying = { ...bill, paidBy: 'alice' };
      const result2 = calculateBillSplit(billWithAlicePaying);
      expect(result2.shares['alice'].totalShare).toBe(34);
      expect(result2.shares['bob'].totalShare).toBe(33);
      expect(result2.shares['charlie'].totalShare).toBe(33);
      expect(result2.shares['alice'].roundingDifference).toBe(1);
      expect(result2.shares['alice'].totalShare + result2.shares['bob'].totalShare + result2.shares['charlie'].totalShare).toBe(100);
    });

    test('Edge Case 6: qty 3 split among 2 people', () => {
      // Scenario A: Person A claims 2 units, Person B claims 1 unit
      // Item: qty: 3, price: 3000 paise
      const billUnits = {
        paidBy: 'host',
        members: ['host', 'guest'],
        items: [
          {
            name: 'Craft Beers',
            qty: 3,
            price: 3000,
            claims: [
              { userId: 'host', units: 2 },
              { userId: 'guest', units: 1 },
            ],
          },
        ],
        total: 3000,
      };

      const resultUnits = calculateBillSplit(billUnits);
      expect(resultUnits.shares['host'].totalShare).toBe(2000);
      expect(resultUnits.shares['guest'].totalShare).toBe(1000);
      expect(resultUnits.unclaimedTotal).toBe(0);

      // Scenario B: Person A and Person B co-claim the 3 items equally (no units or equal units)
      const billEqual = {
        paidBy: 'host',
        members: ['host', 'guest'],
        items: [
          {
            name: 'Basket of 3 Tacos',
            qty: 3,
            price: 3000,
            claims: [{ userId: 'host' }, { userId: 'guest' }],
          },
        ],
        total: 3000,
      };

      const resultEqual = calculateBillSplit(billEqual);
      expect(resultEqual.shares['host'].totalShare).toBe(1500);
      expect(resultEqual.shares['guest'].totalShare).toBe(1500);

      // Scenario C: Person A claims 1 unit, Person B claims 1 unit, 1 unit unclaimed (total 3 units)
      // Unclaimed unit is 1000 paise.
      // Under split_equally: 500 paise each added.
      // Host: 1000 + 500 = 1500. Guest: 1000 + 500 = 1500.
      const billPartial = {
        paidBy: 'host',
        members: ['host', 'guest'],
        items: [
          {
            name: 'Bottles of Soda',
            qty: 3,
            price: 3000,
            claims: [
              { userId: 'host', units: 1 },
              { userId: 'guest', units: 1 },
            ],
          },
        ],
        total: 3000,
        unclaimedPolicy: 'split_equally',
      };

      const resultPartial = calculateBillSplit(billPartial);
      expect(resultPartial.unclaimedTotal).toBe(1000);
      expect(resultPartial.shares['host'].totalShare).toBe(1500);
      expect(resultPartial.shares['guest'].totalShare).toBe(1500);

      // Under host_absorbs: Host absorbs the unclaimed 1000 paise.
      // Host: 1000 + 1000 = 2000. Guest: 1000.
      const billAbsorbs = { ...billPartial, unclaimedPolicy: 'host_absorbs' };
      const resultAbsorbs = calculateBillSplit(billAbsorbs);
      expect(resultAbsorbs.shares['host'].totalShare).toBe(2000);
      expect(resultAbsorbs.shares['guest'].totalShare).toBe(1000);
    });
  });

  describe('Non-Responders & Host Assignment Fallbacks', () => {
    test('non-responders fallback splits unclaimed items among non-responders', () => {
      // Alice and Host responded and claimed items.
      // Charlie and David did not respond (non-responders).
      // Item 3 (4000 paise) is unclaimed.
      // Under nonResponderPolicy: split_among_non_responders:
      // Charlie and David get 2000 each.
      const bill = {
        paidBy: 'host',
        members: ['host', 'alice', 'charlie', 'david'],
        nonResponders: ['charlie', 'david'],
        items: [
          { name: 'Dish 1', qty: 1, price: 3000, claims: [{ userId: 'host' }] },
          { name: 'Dish 2', qty: 1, price: 3000, claims: [{ userId: 'alice' }] },
          { name: 'Dish 3 (Unclaimed)', qty: 1, price: 4000, claims: [] },
        ],
        total: 10000,
      };

      const result = calculateBillSplit(bill);

      expect(result.shares['charlie'].unclaimedShare).toBe(2000);
      expect(result.shares['david'].unclaimedShare).toBe(2000);
      expect(result.shares['alice'].unclaimedShare).toBe(0);
      expect(result.shares['host'].unclaimedShare).toBe(0);

      expect(result.shares['host'].totalShare).toBe(3000);
      expect(result.shares['alice'].totalShare).toBe(3000);
      expect(result.shares['charlie'].totalShare).toBe(2000);
      expect(result.shares['david'].totalShare).toBe(2000);
      expect(result.shares['host'].totalShare + result.shares['alice'].totalShare + result.shares['charlie'].totalShare + result.shares['david'].totalShare).toBe(10000);
    });

    test('host manual assignments assign unclaimed items to non-responders', () => {
      // Host manually assigns Item 3 to Charlie
      const bill = {
        paidBy: 'host',
        members: ['host', 'alice', 'charlie'],
        items: [
          { id: 'item_1', name: 'Dish 1', qty: 1, price: 3000, claims: [{ userId: 'host' }] },
          { id: 'item_2', name: 'Dish 2', qty: 1, price: 3000, claims: [{ userId: 'alice' }] },
          { id: 'item_3', name: 'Dish 3', qty: 1, price: 4000, claims: [] },
        ],
        assignments: [
          { itemId: 'item_3', claimantId: 'charlie', units: 1 },
        ],
        total: 10000,
      };

      const result = calculateBillSplit(bill);

      expect(result.unclaimedTotal).toBe(0);
      expect(result.shares['charlie'].itemsSubtotal).toBe(4000);
      expect(result.shares['charlie'].totalShare).toBe(4000);
    });
  });

  describe('Complex Comprehensive Bill Test', () => {
    test('handles 5 members, multiple items, tax, service charge, tip, discount, and ensures exact paise match', () => {
      const bill = {
        paidBy: 'm1',
        members: [
          { id: 'm1', name: 'Host / Payer' },
          { id: 'm2', name: 'Alice' },
          { id: 'm3', name: 'Bob' },
          { id: 'm4', name: 'Charlie' },
          { id: 'm5', name: 'Diana (Guest)' },
        ],
        items: [
          { name: 'Appetizer Sampler', qty: 1, price: 4500, claims: [{ userId: 'm1' }, { userId: 'm2' }, { userId: 'm3' }] }, // 1500 each
          { name: 'Lamb Chops', qty: 1, price: 8500, claims: [{ userId: 'm1' }] }, // 8500
          { name: 'Sushi Set', qty: 1, price: 7200, claims: [{ userId: 'm2' }] }, // 7200
          { name: 'Pasta', qty: 1, price: 5400, claims: [{ userId: 'm3' }] }, // 5400
          { name: 'Cocktails', qty: 4, price: 6000, claims: [{ userId: 'm4', units: 2 }, { guestId: 'm5', units: 2 }] }, // 3000 each
        ],
        tax: 2845,
        serviceCharge: 1580,
        tip: 2500,
        discount: 1500,
        // Items total = 4500 + 8500 + 7200 + 5400 + 6000 = 31600
        // Expected total = 31600 + 2845 + 1580 + 2500 - 1500 = 37025
        total: 37025,
      };

      const result = calculateBillSplit(bill);

      expect(result.isValid).toBe(true);
      expect(result.itemsTotal).toBe(31600);
      expect(result.total).toBe(37025);

      // Verify every member has non-negative total
      result.sharesList.forEach((share) => {
        expect(share.totalShare).toBeGreaterThan(0);
        expect(Number.isInteger(share.totalShare)).toBe(true);
      });

      // Sum of all member totalShares must match bill.total down to the last single paisa
      const totalSum = result.sharesList.reduce((acc, s) => acc + s.totalShare, 0);
      expect(totalSum).toBe(37025);

      // Settlements: 4 members owe the host
      expect(result.settlementSummary.length).toBe(4);
      const totalSettlements = result.settlementSummary.reduce((acc, s) => acc + s.amount, 0);
      expect(totalSettlements).toBe(37025 - result.shares['m1'].totalShare);
    });
  });

  describe('Validation & Error Handling', () => {
    test('throws error if bill object or paidBy is missing', () => {
      expect(() => calculateBillSplit(null)).toThrow('Bill data is required');
      expect(() => calculateBillSplit({})).toThrow('paidBy is required');
    });

    test('handles empty items array gracefully', () => {
      const bill = {
        paidBy: 'host',
        members: ['host', 'alice'],
        items: [],
        tax: 0,
        total: 0,
      };
      const result = calculateBillSplit(bill);
      expect(result.itemsTotal).toBe(0);
      expect(result.total).toBe(0);
      expect(result.shares['host'].totalShare).toBe(0);
      expect(result.shares['alice'].totalShare).toBe(0);
    });

    test('handles guest claimants without pre-registered member ID', () => {
      const bill = {
        paidBy: 'host',
        members: ['host'],
        items: [
          { name: 'Burger', qty: 1, price: 2000, claims: [{ guestId: 'guest_raj' }] },
        ],
        total: 2000,
      };
      const result = calculateBillSplit(bill);
      expect(result.shares['guest_raj']).toBeDefined();
      expect(result.shares['guest_raj'].totalShare).toBe(2000);
      expect(result.settlementSummary).toEqual([
        {
          from: 'guest_raj',
          fromName: 'guest_raj',
          to: 'host',
          toName: 'host',
          amount: 2000,
        },
      ]);
    });

    test('handles claims with 0 units or overclaimed units (> item.qty)', () => {
      // Item 1: units = 0 (effectively unclaimed)
      // Item 2: qty = 2, but Alice claims 2 and Bob claims 2 (total units = 4 > 2, split proportionally 50/50)
      const bill = {
        paidBy: 'host',
        members: ['host', 'alice', 'bob'],
        items: [
          { name: 'Item with 0 units', qty: 1, price: 1000, claims: [{ userId: 'alice', units: 0 }] },
          { name: 'Overclaimed item', qty: 2, price: 4000, claims: [{ userId: 'alice', units: 2 }, { userId: 'bob', units: 2 }] },
        ],
        total: 5000,
        unclaimedPolicy: 'split_equally',
      };

      const result = calculateBillSplit(bill);
      expect(result.unclaimedTotal).toBe(1000); // the 0-units item is treated as unclaimed
      // Overclaimed item split 50/50: 2000 each
      // Unclaimed 1000 split 3 ways: 333 each (host gets 334)
      expect(result.shares['alice'].itemsSubtotal).toBe(2000);
      expect(result.shares['bob'].itemsSubtotal).toBe(2000);
      expect(result.total).toBe(5000);
    });
  });
});

