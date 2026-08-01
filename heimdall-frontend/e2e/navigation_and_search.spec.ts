import { test, expect } from '@playwright/test';

test.describe('Navigation, Command Palette & Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Inject auth token so ProtectedRoute allows entry
    await page.addInitScript(() => {
      localStorage.setItem('heimdall_access_token', 'mock_jwt_token');
      localStorage.setItem('heimdall_refresh_token', 'mock_refresh_token');
      localStorage.setItem('heimdall_user', JSON.stringify({ id: 1, username: 'analyst_1', role: 'ADMIN' }));
    });

    // Mock generic API calls
    await page.route('**/api/v1/anomalies*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }),
      });
    });

    await page.route('**/api/v1/cases*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }),
      });
    });

    await page.route('**/api/v1/audit*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }),
      });
    });
  });

  test('navigates seamlessly across primary rail routes', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/.*\/$/);
    
    // Navigate to Anomalies
    await page.click('a[href="/anomalies"]');
    await expect(page).toHaveURL(/.*\/anomalies/);
    await expect(page.locator('h1')).toContainText('Anomalies');

    // Navigate to Investigations
    await page.click('a[href="/investigations"]');
    await expect(page).toHaveURL(/.*\/investigations/);
    await expect(page.locator('h1')).toContainText('Investigations');

    // Navigate to Watchlists
    await page.click('a[href="/watchlists"]');
    await expect(page).toHaveURL(/.*\/watchlists/);

    // Navigate to Audit Log
    await page.click('a[href="/audit"]');
    await expect(page).toHaveURL(/.*\/audit/);
  });

  test('opens command palette and performs fuzzy search navigation', async ({ page }) => {
    await page.goto('/');

    // Press Ctrl+K to trigger command palette
    await page.keyboard.press('Control+k');

    // Palette modal should be visible
    const palette = page.locator('[role="dialog"][aria-label="Command Palette"]');
    await expect(palette).toBeVisible({ timeout: 5000 });

    const searchInput = palette.locator('input[type="text"]');
    await expect(searchInput).toBeFocused();

    // Type navigation query
    await searchInput.fill('audit');
    await page.waitForTimeout(200);

    // Press Enter to navigate
    await page.keyboard.press('Enter');

    // Should route to /audit
    await expect(page).toHaveURL(/.*\/audit/);
  });

  test('toggles compact mode density and persists in DOM', async ({ page }) => {
    await page.goto('/');

    // Open settings modal from the rail
    await page.getByRole('button', { name: /settings/i }).click();

    // Settings dialog should open
    const settingsDialog = page.locator('text=Workstation Settings');
    await expect(settingsDialog).toBeVisible();

    // Select Compact mode button
    const compactBtn = page.getByRole('button', { name: /compact/i });
    await compactBtn.click();

    // Body should now have .compact-mode class
    const bodyClass = await page.locator('body').getAttribute('class');
    expect(bodyClass).toContain('compact-mode');

    // Reload and ensure persistence
    await page.reload();
    const reloadedBodyClass = await page.locator('body').getAttribute('class');
    expect(reloadedBodyClass).toContain('compact-mode');
  });
});
