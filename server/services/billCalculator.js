/**
 * Bill Calculation Engine for FinSight "Split by Items"
 *
 * Pure function module for calculating itemized bill splits with proportional
 * tax, service charges, tip, discounts, unclaimed item policies, and integer
 * paise precision.
 */

/**
 * Convert float currency amount (e.g. Rupees 12.50) to integer paise (1250)
 * Uses Math.round to avoid IEEE 754 floating-point inaccuracies.
 *
 * @param {number|string} amount
 * @returns {number} Integer paise
 */
function toPaise(amount) {
  if (amount === undefined || amount === null || amount === '') return 0;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100);
}

/**
 * Convert integer paise (1250) to currency decimal string ("12.50")
 *
 * @param {number} paise
 * @returns {string} Formatted decimal string
 */
function fromPaise(paise) {
  const num = Math.round(Number(paise) || 0);
  return (num / 100).toFixed(2);
}

/**
 * Normalize an ID to a string
 *
 * @param {any} val
 * @returns {string}
 */
function normalizeId(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object' && val.toString) return val.toString().trim();
  return String(val).trim();
}

/**
 * Extract claimant ID from claim object or string
 *
 * @param {object|string} claim
 * @returns {string}
 */
function resolveClaimantId(claim) {
  if (!claim) return '';
  if (typeof claim === 'string') return normalizeId(claim);
  return normalizeId(claim.claimantId || claim.userId || claim.guestId || claim.memberId || claim.id);
}

/**
 * Validates whether the bill total matches: itemsTotal + tax + serviceCharge + tip - discount
 *
 * @param {object} bill
 * @returns {{ isValid: boolean, itemsTotal: number, calculatedTotal: number, providedTotal: number, discrepancy: number }}
 */
function validateBillTotals(bill) {
  const items = Array.isArray(bill.items) ? bill.items : [];
  const itemsTotal = items.reduce((sum, item) => sum + Math.round(Number(item.price) || 0), 0);
  const tax = Math.round(Number(bill.tax) || 0);
  const serviceCharge = Math.round(Number(bill.serviceCharge) || 0);
  const tip = Math.round(Number(bill.tip) || 0);
  const discount = Math.round(Number(bill.discount) || 0);

  const calculatedTotal = Math.max(0, itemsTotal + tax + serviceCharge + tip - discount);
  const providedTotal = bill.total !== undefined && bill.total !== null ? Math.round(Number(bill.total)) : calculatedTotal;
  const discrepancy = calculatedTotal - providedTotal;

  return {
    isValid: discrepancy === 0,
    itemsTotal,
    tax,
    serviceCharge,
    tip,
    discount,
    calculatedTotal,
    providedTotal,
    discrepancy,
  };
}

/**
 * Core Pure Calculation Function
 *
 * @param {object} bill
 * @param {string} bill.paidBy - ID of the member who paid
 * @param {Array<string|object>} bill.members - List of member IDs or member objects { id, name }
 * @param {Array<object>} bill.items - Array of items: { _id/id, name, qty, price, claims: [{ userId/guestId, units }] }
 * @param {number} [bill.tax=0] - Tax in paise
 * @param {number} [bill.serviceCharge=0] - Service charge in paise
 * @param {number} [bill.tip=0] - Tip in paise
 * @param {number} [bill.discount=0] - Discount in paise
 * @param {number} [bill.total] - Total in paise (defaults to itemsTotal + charges - discount)
 * @param {'split_equally'|'host_absorbs'} [bill.unclaimedPolicy='split_equally'] - Policy for unclaimed items
 * @param {Array<string>} [bill.nonResponders=[]] - Member IDs who did not respond
 * @param {'split_among_non_responders'|'split_equally'|'host_absorbs'} [bill.nonResponderPolicy] - Fallback policy
 * @param {Array<object>} [bill.assignments=[]] - Host item assignments: [{ itemId, claimantId, units }]
 *
 * @returns {object} Full calculation breakdown with exact integer paise reconciliation
 */
function calculateBillSplit(bill) {
  if (!bill) {
    throw new Error('Bill data is required for calculation');
  }

  const paidById = normalizeId(bill.paidBy);
  if (!paidById) {
    throw new Error('paidBy is required to attribute rounding leftovers and settlements');
  }

  // Normalize members map: id -> { id, name }
  const memberMap = new Map();
  if (Array.isArray(bill.members)) {
    bill.members.forEach((m) => {
      if (typeof m === 'string') {
        const id = normalizeId(m);
        if (id) memberMap.set(id, { id, name: id });
      } else if (m && typeof m === 'object') {
        const id = normalizeId(m._id || m.id || m.userId);
        if (id) memberMap.set(id, { id, name: m.name || id, email: m.email });
      }
    });
  }

  // Ensure payer is in members
  if (!memberMap.has(paidById)) {
    memberMap.set(paidById, { id: paidById, name: 'Payer' });
  }

  // Clone items and incorporate any manual host assignments
  const rawItems = Array.isArray(bill.items) ? bill.items : [];
  const assignments = Array.isArray(bill.assignments) ? bill.assignments : [];

  const items = rawItems.map((item, idx) => {
    const itemId = normalizeId(item._id || item.id || `item_${idx}`);
    const name = item.name || `Item ${idx + 1}`;
    const qty = Math.max(1, Math.round(Number(item.qty) || 1));
    const price = Math.max(0, Math.round(Number(item.price) || 0)); // in paise

    // Clone existing claims
    const claims = Array.isArray(item.claims)
      ? item.claims
          .map((c) => ({
            claimantId: resolveClaimantId(c),
            units: c.units !== undefined && c.units !== null ? Number(c.units) : null,
          }))
          .filter((c) => Boolean(c.claimantId))
      : [];

    // Apply manual assignments for this item
    assignments
      .filter((a) => normalizeId(a.itemId) === itemId)
      .forEach((a) => {
        const claimantId = resolveClaimantId(a);
        if (claimantId) {
          const existing = claims.find((c) => c.claimantId === claimantId);
          if (existing) {
            existing.units = (existing.units || 1) + (a.units !== undefined ? Number(a.units) : 1);
          } else {
            claims.push({
              claimantId,
              units: a.units !== undefined ? Number(a.units) : 1,
            });
          }
        }
      });

    // Register any new claimants into memberMap (e.g. guests)
    claims.forEach((c) => {
      if (!memberMap.has(c.claimantId)) {
        memberMap.set(c.claimantId, { id: c.claimantId, name: c.claimantId });
      }
    });

    return { itemId, name, qty, price, claims };
  });

  const memberList = Array.from(memberMap.values());
  const memberIds = memberList.map((m) => m.id);

  // Charges & discount in paise
  const tax = Math.max(0, Math.round(Number(bill.tax) || 0));
  const serviceCharge = Math.max(0, Math.round(Number(bill.serviceCharge) || 0));
  const tip = Math.max(0, Math.round(Number(bill.tip) || 0));
  const discount = Math.max(0, Math.round(Number(bill.discount) || 0));

  const itemsTotal = items.reduce((sum, item) => sum + item.price, 0);
  const calculatedTotal = Math.max(0, itemsTotal + tax + serviceCharge + tip - discount);
  const billTotal = bill.total !== undefined && bill.total !== null ? Math.round(Number(bill.total)) : calculatedTotal;

  // Initialize tracking for each member
  const memberItemSubtotals = {};
  const memberClaimedItems = {};
  memberIds.forEach((id) => {
    memberItemSubtotals[id] = 0; // exact float paise during accumulation
    memberClaimedItems[id] = [];
  });

  // Track unclaimed items and units
  let totalUnclaimedPaise = 0;
  const unclaimedItemsBreakdown = [];

  // Step 1: Divide each item's price among claimants
  items.forEach((item) => {
    if (item.price === 0) {
      // Free item
      if (item.claims.length === 0) {
        unclaimedItemsBreakdown.push({
          itemId: item.itemId,
          name: item.name,
          qty: item.qty,
          unclaimedUnits: item.qty,
          unclaimedAmount: 0,
        });
      }
      return;
    }

    if (item.claims.length === 0) {
      // Entirely unclaimed
      totalUnclaimedPaise += item.price;
      unclaimedItemsBreakdown.push({
        itemId: item.itemId,
        name: item.name,
        qty: item.qty,
        unclaimedUnits: item.qty,
        unclaimedAmount: item.price,
      });
      return;
    }

    // Check if claims have explicit unit counts
    const hasExplicitUnits = item.claims.some((c) => c.units !== null && c.units !== undefined);

    if (!hasExplicitUnits) {
      // All claimants divide the item price equally
      const sharePerPerson = item.price / item.claims.length;
      item.claims.forEach((claim) => {
        memberItemSubtotals[claim.claimantId] += sharePerPerson;
        memberClaimedItems[claim.claimantId].push({
          itemId: item.itemId,
          name: item.name,
          units: item.qty / item.claims.length,
          amount: Math.round(sharePerPerson),
        });
      });
    } else {
      // Units are specified
      const totalClaimedUnits = item.claims.reduce((sum, c) => sum + Math.max(0, Number(c.units) || 0), 0);

      if (totalClaimedUnits <= 0) {
        // No valid units claimed
        totalUnclaimedPaise += item.price;
        unclaimedItemsBreakdown.push({
          itemId: item.itemId,
          name: item.name,
          qty: item.qty,
          unclaimedUnits: item.qty,
          unclaimedAmount: item.price,
        });
      } else if (totalClaimedUnits <= item.qty) {
        // Each unit is worth item.price / item.qty
        const unitPrice = item.price / item.qty;
        item.claims.forEach((claim) => {
          const units = Math.max(0, Number(claim.units) || 0);
          const claimAmount = units * unitPrice;
          memberItemSubtotals[claim.claimantId] += claimAmount;
          memberClaimedItems[claim.claimantId].push({
            itemId: item.itemId,
            name: item.name,
            units,
            amount: Math.round(claimAmount),
          });
        });

        const unclaimedUnits = item.qty - totalClaimedUnits;
        if (unclaimedUnits > 0) {
          const unclaimedAmount = unclaimedUnits * unitPrice;
          totalUnclaimedPaise += unclaimedAmount;
          unclaimedItemsBreakdown.push({
            itemId: item.itemId,
            name: item.name,
            qty: item.qty,
            unclaimedUnits,
            unclaimedAmount: Math.round(unclaimedAmount),
          });
        }
      } else {
        // totalClaimedUnits > item.qty (e.g. multiple people sharing or overclaiming)
        // Divide proportionally among claimed units
        item.claims.forEach((claim) => {
          const units = Math.max(0, Number(claim.units) || 0);
          const claimAmount = (units / totalClaimedUnits) * item.price;
          memberItemSubtotals[claim.claimantId] += claimAmount;
          memberClaimedItems[claim.claimantId].push({
            itemId: item.itemId,
            name: item.name,
            units: (units / totalClaimedUnits) * item.qty,
            amount: Math.round(claimAmount),
          });
        });
      }
    }
  });

  // Step 2: Handle Unclaimed Items Policy & Non-Responders
  // Available policies: 'split_equally' | 'host_absorbs'
  const unclaimedPolicy = bill.unclaimedPolicy || 'split_equally';
  const nonResponders = Array.isArray(bill.nonResponders)
    ? bill.nonResponders.map(normalizeId).filter((id) => memberMap.has(id))
    : [];
  const nonResponderPolicy = bill.nonResponderPolicy || (nonResponders.length > 0 ? 'split_among_non_responders' : unclaimedPolicy);

  const memberUnclaimedShare = {};
  memberIds.forEach((id) => {
    memberUnclaimedShare[id] = 0;
  });

  if (totalUnclaimedPaise > 0) {
    if (nonResponderPolicy === 'split_among_non_responders' && nonResponders.length > 0) {
      // Split unclaimed items equally among non-responders
      const sharePerNonResponder = totalUnclaimedPaise / nonResponders.length;
      nonResponders.forEach((id) => {
        memberUnclaimedShare[id] = sharePerNonResponder;
        memberItemSubtotals[id] += sharePerNonResponder;
      });
    } else if (unclaimedPolicy === 'host_absorbs') {
      // Host absorbs all unclaimed paise
      memberUnclaimedShare[paidById] = totalUnclaimedPaise;
      memberItemSubtotals[paidById] += totalUnclaimedPaise;
    } else {
      // Default: 'split_equally' among all members
      const sharePerMember = totalUnclaimedPaise / memberIds.length;
      memberIds.forEach((id) => {
        memberUnclaimedShare[id] = sharePerMember;
        memberItemSubtotals[id] += sharePerMember;
      });
    }
  }

  // Step 3: Proportional calculation of Tax, Service Charge, Tip, and Discount
  // The sum of memberItemSubtotals now equals itemsTotal
  const effectiveItemsTotal = Object.values(memberItemSubtotals).reduce((sum, val) => sum + val, 0);

  // Compute proportion ratio for each member
  const memberRatios = {};
  memberIds.forEach((id) => {
    if (effectiveItemsTotal > 0) {
      memberRatios[id] = memberItemSubtotals[id] / effectiveItemsTotal;
    } else {
      // If itemsTotal is 0 (e.g. only cover charge or tip), split equally
      memberRatios[id] = 1 / memberIds.length;
    }
  });

  // Calculate baseline rounded shares for all members
  const baselineSubtotals = {};
  const baselineTaxShares = {};
  const baselineServiceChargeShares = {};
  const baselineTipShares = {};
  const baselineDiscountShares = {};
  const baselineTotals = {};

  memberIds.forEach((id) => {
    const ratio = memberRatios[id];
    const roundedSubtotal = Math.round(memberItemSubtotals[id]);
    const tShare = Math.round(tax * ratio);
    const scShare = Math.round(serviceCharge * ratio);
    const tipShare = Math.round(tip * ratio);
    const dShare = Math.round(discount * ratio);

    baselineSubtotals[id] = roundedSubtotal;
    baselineTaxShares[id] = tShare;
    baselineServiceChargeShares[id] = scShare;
    baselineTipShares[id] = tipShare;
    baselineDiscountShares[id] = dShare;
    baselineTotals[id] = Math.max(0, roundedSubtotal + tShare + scShare + tipShare - dShare);
  });

  const memberTaxShare = {};
  const memberServiceChargeShare = {};
  const memberTipShare = {};
  const memberDiscountShare = {};
  const memberRoundedSubtotal = {};
  const memberTotalShare = {};

  let nonPayerSubtotalSum = 0;
  let nonPayerTaxSum = 0;
  let nonPayerServiceChargeSum = 0;
  let nonPayerTipSum = 0;
  let nonPayerDiscountSum = 0;
  let nonPayerTotalShareSum = 0;

  const nonPayerIds = memberIds.filter((id) => id !== paidById);

  nonPayerIds.forEach((id) => {
    memberRoundedSubtotal[id] = baselineSubtotals[id];
    memberTaxShare[id] = baselineTaxShares[id];
    memberServiceChargeShare[id] = baselineServiceChargeShares[id];
    memberTipShare[id] = baselineTipShares[id];
    memberDiscountShare[id] = baselineDiscountShares[id];
    memberTotalShare[id] = baselineTotals[id];

    nonPayerSubtotalSum += baselineSubtotals[id];
    nonPayerTaxSum += baselineTaxShares[id];
    nonPayerServiceChargeSum += baselineServiceChargeShares[id];
    nonPayerTipSum += baselineTipShares[id];
    nonPayerDiscountSum += baselineDiscountShares[id];
    nonPayerTotalShareSum += baselineTotals[id];
  });

  // For the payer: assign remaining amounts so components sum exactly to totals
  memberRoundedSubtotal[paidById] = itemsTotal - nonPayerSubtotalSum;
  memberTaxShare[paidById] = tax - nonPayerTaxSum;
  memberServiceChargeShare[paidById] = serviceCharge - nonPayerServiceChargeSum;
  memberTipShare[paidById] = tip - nonPayerTipSum;
  memberDiscountShare[paidById] = discount - nonPayerDiscountSum;

  // The payer receives all rounding leftovers so sum(totalShare) === billTotal
  const payerRawTotal = billTotal - nonPayerTotalShareSum;
  memberTotalShare[paidById] = payerRawTotal;

  // Rounding difference attributed to the payer
  const payerRoundingDifference = memberTotalShare[paidById] - baselineTotals[paidById];

  // Step 5: Format member shares result
  const shares = {};
  const sharesList = [];
  const settlements = [];

  memberIds.forEach((id) => {
    const info = memberMap.get(id);
    const isPayer = id === paidById;
    const shareObj = {
      memberId: id,
      name: info.name,
      email: info.email,
      isPayer,
      claimedItems: memberClaimedItems[id] || [],
      itemsSubtotal: Math.round(memberItemSubtotals[id] - memberUnclaimedShare[id]),
      unclaimedShare: Math.round(memberUnclaimedShare[id]),
      subtotal: memberRoundedSubtotal[id],
      ratio: memberRatios[id],
      taxShare: memberTaxShare[id],
      serviceChargeShare: memberServiceChargeShare[id],
      tipShare: memberTipShare[id],
      discountShare: memberDiscountShare[id],
      roundingDifference: isPayer ? payerRoundingDifference : 0,
      totalShare: memberTotalShare[id],
    };

    shares[id] = shareObj;
    sharesList.push(shareObj);

    if (!isPayer && memberTotalShare[id] > 0) {
      settlements.push({
        from: id,
        fromName: info.name,
        to: paidById,
        toName: memberMap.get(paidById)?.name || 'Payer',
        amount: memberTotalShare[id],
      });
    }
  });

  const validation = validateBillTotals({
    items,
    tax,
    serviceCharge,
    tip,
    discount,
    total: billTotal,
  });

  return {
    isValid: validation.isValid,
    total: billTotal,
    itemsTotal,
    tax,
    serviceCharge,
    tip,
    discount,
    unclaimedTotal: Math.round(totalUnclaimedPaise),
    unclaimedItems: unclaimedItemsBreakdown,
    unclaimedPolicy,
    paidBy: paidById,
    shares,
    sharesList,
    settlementSummary: settlements,
  };
}

module.exports = {
  calculateBillSplit,
  validateBillTotals,
  toPaise,
  fromPaise,
  resolveClaimantId,
};
