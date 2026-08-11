import { test, expect } from '@playwright/test';

const mockCases = [
  {
    id: 1,
    title: 'Suspicious BTC Volume Spike for BTCUSDT',
    description: 'Abnormal 10x volume jump detected during low-liquidity window.',
    status: 'OPEN',
    assigned_to_user_id: 1,
    created_by_user_id: 1,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
    correlated_anomaly_count: 3,
    anomaly_ids: [],
  },
  {
    id: 2,
    title: 'ETH Wash Trading Pattern for ETHUSDT',
    description: 'Circular order execution matched across related sub-accounts.',
    status: 'CLOSED',
    assigned_to_user_id: null,
    created_by_user_id: 1,
    created_at: '2026-07-31T08:00:00Z',
    updated_at: '2026-07-31T12:00:00Z',
    correlated_anomaly_count: 1,
    anomaly_ids: [],
  },
];

test.describe('Investigations Workflow & Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('heimdall_access_token', 'mock_jwt_token');
      localStorage.setItem('heimdall_refresh_token', 'mock_refresh_token');
      localStorage.setItem('heimdall_user', JSON.stringify({ id: 1, username: 'analyst_1', role: 'ADMIN' }));
    });

    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes('/auth/me')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, username: 'analyst_1', role: 'ADMIN' }),
        });
      }

      if (url.includes('/auth/refresh')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ access_token: 'mock_jwt_token' }),
        });
      }

      if (url.includes('/auth/sse-token')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ token: 'mock_sse_token' }),
        });
      }

      if (url.includes('/cases/analysts')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, username: 'analyst_1', role: 'ADMIN' },
          ]),
        });
      }

      if (url.includes('/anomalies')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], total: 0, limit: 100, offset: 0 }),
        });
      }

      if (url.includes('/market-data')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      if (url.includes('/cases/1/notes')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 10, note: 'Initial flag created by rule engine.', created_at: '2026-08-01T10:05:00Z', author_user_id: 1 },
          ]),
        });
      }

      if (url.includes('/cases/1/events')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, old_status: null, new_status: 'OPEN', note: 'Created', changed_at: '2026-08-01T10:00:00Z', actor_user_id: 1 },
          ]),
        });
      }

      if (url.endsWith('/cases/1') || url.includes('/cases/1?')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockCases[0]),
        });
      }

      if (url.includes('/cases/2/notes')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      if (url.includes('/cases/2/events')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 2, old_status: 'OPEN', new_status: 'CLOSED', note: 'Resolved', changed_at: '2026-07-31T12:00:00Z', actor_user_id: 1 },
          ]),
        });
      }

      if (url.endsWith('/cases/2') || url.includes('/cases/2?')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockCases[1]),
        });
      }

      if (method === 'PATCH' && url.includes('/cases/')) {
        const payload = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockCases[1],
            status: payload?.status || 'OPEN',
          }),
        });
      }

      if (url.includes('/cases')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: mockCases,
            total: mockCases.length,
            limit: 50,
            offset: 0,
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });
  });

  test('displays investigation case list and loads detail workspace', async ({ page }) => {
    await page.goto('/investigations');

    await expect(page.locator('text=Suspicious BTC Volume Spike')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=ETH Wash Trading Pattern')).toBeVisible();

    // Click on the open case
    await page.locator('text=Suspicious BTC Volume Spike').click();

    // Case detail workspace should render CASE-000001
    await expect(page.locator('text=CASE-000001')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=START REVIEW')).toBeVisible();
    await expect(page.locator('text=Investigation Workspace')).toBeVisible();
  });

  test('opens closed case in detail view and displays workspace', async ({ page }) => {
    await page.goto('/investigations');

    // Click on closed case #2
    await page.locator('text=ETH Wash Trading Pattern').click();
    await expect(page.locator('text=CASE-000002')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=GENERATE REPORT')).toBeVisible();
    await expect(page.locator('text=Case Information')).toBeVisible();
  });
});
