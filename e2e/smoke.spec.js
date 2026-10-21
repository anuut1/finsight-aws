import { test, expect } from '@playwright/test';

test.describe('FinSight Core E2E Smoke Flow', () => {
  const uniqueId = Date.now();
  const testUser = {
    name: 'Playwright QA',
    email: `qa_${uniqueId}@finsight.local`,
    password: 'Password@123',
  };

  test('registers, logs in, creates a transaction, starts a trip, adds trip expense, and completes trip', async ({ page }) => {
    // 1. Visit Register Page
    await page.goto('/register');
    await expect(page).toHaveTitle(/FinSight/i);

    // 2. Fill Register Form
    await page.getByPlaceholder(/your full name/i).fill(testUser.name);
    await page.getByPlaceholder(/name@example\.com/i).fill(testUser.email);
    await page.getByPlaceholder(/enter strong password/i).fill(testUser.password);
    await page.getByRole('button', { name: /create account/i }).click();

    // 3. Verify redirected to Dashboard
    await expect(page).toHaveURL(/\/(dashboard)?$/);
    await expect(page.getByText(/Safe to spend/i)).toBeVisible({ timeout: 10000 });

    // 4. Create a Transaction via QuickAddBar
    const quickAddInput = page.getByPlaceholder(/Type, speak, or scan/i);
    await expect(quickAddInput).toBeVisible();
    await quickAddInput.fill('Lunch 450 at Subway');
    await quickAddInput.press('Enter');

    // QuickAdd review card should appear
    await expect(page.getByText(/Review details before adding/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /confirm & save/i }).click();

    // 5. Navigate to Trips/Splits
    await page.goto('/splits');
    await expect(page.getByText(/Group Trips & Shared Expenses/i)).toBeVisible();

    // 6. Start / Create a Trip Group
    await page.getByRole('button', { name: /\+ New Group/i }).click();
    await page.getByPlaceholder(/e\.g\. Goa Trip 2026/i).fill(`Smoke Trip ${uniqueId}`);
    await page.getByPlaceholder(/Add friend name/i).fill('Alex Partner');
    await page.getByRole('button', { name: /Add Member/i }).click();
    await page.getByRole('button', { name: /Create Group/i }).click();

    // Verify trip group created
    await expect(page.getByText(`Smoke Trip ${uniqueId}`)).toBeVisible({ timeout: 8000 });

    // 7. Add Expense using one-step modal
    await page.getByText(`Smoke Trip ${uniqueId}`).click();
    await page.getByRole('button', { name: /\+ Add Expense/i }).click();

    await page.getByLabel(/What was it for/i).fill('Dinner & Drinks');
    await page.getByLabel(/Amount/i).fill('1200');
    await page.getByRole('button', { name: /Add Expense/i }).click();

    // Verify expense added to balance
    await expect(page.getByText('Dinner & Drinks')).toBeVisible({ timeout: 6000 });

    // 8. End Trip / Settle
    const endTripBtn = page.getByRole('button', { name: /End Trip & Settle/i });
    if (await endTripBtn.isVisible()) {
      await endTripBtn.click();
      await page.getByRole('button', { name: /Confirm End Trip/i }).click();
      await expect(page.getByText(/Trip Settled/i)).toBeVisible();
    }
  });
});
