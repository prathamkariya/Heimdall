import { test, expect } from '@playwright/test';

const mockAnomalies = {
  items: [
    {
      id: 101,
      market_data_id: 501,
      symbol: 'BTCUSDT',
      market: 'CRYPTO',
      timestamp: '2026-08-01T12:00:00Z',
      anomaly_score: 0.94,
      is_anomaly: true,
      model_version: 'iforest_v2',
      multi_pattern_max_score: 0.98,
      pattern_scores: JSON.stringify({ pump_and_dump: 0.98, wash_trading: 0.12, spoofing: 0.05 }),
      created_at: '2026-08-01T12:00:05Z',
      detected_at: '2026-08-01T12:00:05Z',
      open: 64200.0,
      high: 68500.0,
      low: 64100.0,
      close: 67900.0,
      volume: 4500.0,
      severity: 'CRITICAL',
      primary_signal: 'PUMP & DUMP',
    },
    {
      id: 102,
      market_data_id: 502,
      symbol: 'ETHUSDT',
      market: 'CRYPTO',
      timestamp: '2026-08-01T12:05:00Z',
      anomaly_score: 0.88,
      is_anomaly: true,
      model_version: 'iforest_v2',
      multi_pattern_max_score: 0.85,
      pattern_scores: JSON.stringify({ spoofing: 0.85, pump_and_dump: 0.20 }),
      created_at: '2026-08-01T12:05:05Z',
      detected_at: '2026-08-01T12:05:05Z',
      open: 3450.0,
      high: 3460.0,
      low: 3380.0,
      close: 3390.0,
      volume: 12000.0,
      severity: 'HIGH',
      primary_signal: 'SPOOFING',
    },
  ],
  total: 2,
  limit: 50,
  offset: 0,
};

test.describe('Anomalies Workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('heimdall_access_token', 'mock_jwt_token');
      localStorage.setItem('heimdall_refresh_token', 'mock_refresh_token');
      localStorage.setItem('heimdall_user', JSON.stringify({ id: 1, username: 'analyst_1', role: 'ADMIN' }));
      localStorage.removeItem('heimdall_visible_columns');
    });

    // Intercept anomaly API requests
    await page.route('**/api/v1/anomalies*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAnomalies),
      });
    });

    await page.route('**/api/v1/cases*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.route('**/api/v1/market-data*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('renders anomalies table with data and handles row selection', async ({ page }) => {
    await page.goto('/anomalies');

    // Verify rows are visible
    await expect(page.locator('text=BTCUSDT')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=ETHUSDT')).toBeVisible();

    // Click on the first anomaly row
    await page.locator('text=BTCUSDT').click();

    // Side panel (AnomalyDetail) should slide in
    await expect(page.locator('text=Detection Summary')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Price History (BTCUSDT)')).toBeVisible();
    await expect(page.locator('text=Anomaly Confidence')).toBeVisible();
  });

  test('customizes visible columns and persists selection in localStorage', async ({ page }) => {
    await page.goto('/anomalies');

    await expect(page.locator('text=BTCUSDT')).toBeVisible();

    // Click "COLUMNS" dropdown
    const columnsBtn = page.getByRole('button', { name: /columns/i });
    await columnsBtn.click();

    // Dropdown list should appear with Visible Columns
    const dropdown = page.locator('text=Visible Columns');
    await expect(dropdown).toBeVisible();

    // Toggle off the 'Market' column
    const marketCheckbox = page.locator('label:has-text("Market") input[type="checkbox"]');
    await marketCheckbox.click();

    // Check localStorage has saved updated columns excluding Market
    const savedCols = await page.evaluate(() => localStorage.getItem('heimdall_visible_columns'));
    expect(savedCols).not.toContain('"Market"');

    // Reload page and check that Market header is no longer displayed in the column bar
    await page.reload();
    await expect(page.locator('text=BTCUSDT')).toBeVisible();
  });
});
